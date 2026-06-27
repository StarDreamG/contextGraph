import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { stableId } from "../indexing/hash.js";
import { openDatabase } from "../storage/database.js";
import type { ContextGraphDatabase } from "../storage/database.js";
import { migrate } from "../storage/schema.js";
import type {
  ContextGraphConfig,
  DerivedIndexSnapshot,
  EmbeddingConfig,
  EmbeddingProviderName
} from "../types/domain.js";

export interface EnableEmbeddingOptions {
  provider: Exclude<EmbeddingProviderName, "none">;
  model: string;
  endpoint?: string;
  dimensions?: number;
}

export interface RebuildEmbeddingOptions {
  similarityThreshold?: number;
  maxEdgesPerBlock?: number;
}

export interface EmbeddingRebuildResult {
  provider: EmbeddingProviderName;
  model: string;
  embeddingsCreated: number;
  embeddingsSkipped: number;
  candidateEdgesCreated: number;
  dimensions: number | null;
}

interface EmbeddingProvider {
  provider: EmbeddingProviderName;
  model: string;
  embed(texts: string[]): Promise<number[][]>;
}

interface BlockForEmbedding {
  id: string;
  content: string;
  hash: string;
}

interface ExistingEmbedding {
  block_id: string;
  block_hash: string;
}

interface EmbeddingRow {
  blockId: string;
  blockHash: string;
  nodeId: string;
  vector: Buffer;
}

const CANDIDATE_SEMANTIC_RELATIONS = [
  "SEMANTICALLY_RELATED",
  "SAME_DOMAIN",
  "MAY_APPLY_TO",
  "POSSIBLY_CONFLICTS",
  "POSSIBLY_REINFORCES"
];

export async function enableEmbedding(projectRoot: string, options: EnableEmbeddingOptions): Promise<EmbeddingConfig> {
  if (options.model.trim().length === 0) {
    throw new Error("Embedding model must not be empty.");
  }
  const config = await loadConfig(projectRoot);
  const next: EmbeddingConfig = {
    enabled: true,
    provider: options.provider,
    model: options.model,
    dimensions: options.dimensions ?? null,
    endpoint: options.endpoint,
    updatedAt: new Date().toISOString(),
    lastError: null
  };
  await writeConfig(projectRoot, { ...config, embedding: next });
  return next;
}

export async function disableEmbedding(projectRoot: string): Promise<EmbeddingConfig> {
  const config = await loadConfig(projectRoot);
  const next: EmbeddingConfig = {
    enabled: false,
    provider: "none",
    model: null,
    dimensions: null,
    updatedAt: new Date().toISOString(),
    lastError: null
  };
  await writeConfig(projectRoot, { ...config, embedding: next });
  return next;
}

export async function rebuildEmbeddings(
  projectRoot: string,
  options: RebuildEmbeddingOptions = {}
): Promise<EmbeddingRebuildResult> {
  const config = await loadConfig(projectRoot);
  const embedding = enabledEmbeddingConfig(config);
  const provider = createProvider(embedding);
  const db = openDatabase(path.join(projectRoot, ".contextgraph", "graph.db"));
  migrate(db);

  try {
    const blocks = db.prepare("SELECT id, content, hash FROM blocks ORDER BY path, start_line, id").all() as BlockForEmbedding[];
    const existing = readExistingEmbeddings(db, embedding);
    const changedBlocks = blocks.filter((block) => existing.get(block.id) !== block.hash);
    const embeddingsSkipped = blocks.length - changedBlocks.length;
    let embeddingsCreated = 0;
    let dimensions: number | null = embedding.dimensions;

    for (const batch of batches(changedBlocks, 16)) {
      const vectors = await provider.embed(batch.map((block) => block.content));
      if (vectors.length !== batch.length) {
        throw new Error(`Embedding provider returned ${vectors.length} vector(s) for ${batch.length} input(s).`);
      }
      const timestamp = new Date().toISOString();
      db.transaction(() => {
        for (let index = 0; index < batch.length; index += 1) {
          const vector = vectors[index];
          const block = batch[index];
          if (vector.length === 0) {
            throw new Error("Embedding provider returned an empty vector.");
          }
          dimensions = vector.length;
          upsertEmbedding(db, embedding, block, vector, timestamp);
          embeddingsCreated += 1;
        }
      })();
    }

    const candidateEdgesCreated = discoverCandidateSemanticEdges(db, embedding, changedBlocks, {
      similarityThreshold: options.similarityThreshold ?? 0.78,
      maxEdgesPerBlock: options.maxEdgesPerBlock ?? 3
    });

    await writeConfig(projectRoot, {
      ...config,
      embedding: {
        ...embedding,
        dimensions,
        updatedAt: new Date().toISOString(),
        lastError: null
      }
    });

    return {
      provider: embedding.provider,
      model: embedding.model,
      embeddingsCreated,
      embeddingsSkipped,
      candidateEdgesCreated,
      dimensions
    };
  } catch (error) {
    await writeEmbeddingError(projectRoot, config, error);
    throw error;
  } finally {
    db.close();
  }
}

export function readEmbeddingIndexSnapshot(
  db: ContextGraphDatabase,
  config: ContextGraphConfig
): DerivedIndexSnapshot {
  const embedding = config.embedding;
  if (!embedding?.enabled || embedding.provider === "none" || !embedding.model) {
    return disabledEmbeddingSnapshot();
  }

  const enabledEmbedding = embedding as EmbeddingConfig & { model: string };
  const pending = countPendingEmbeddings(db, enabledEmbedding);
  const stale = countStaleEmbeddings(db, enabledEmbedding);
  const candidateEdges = countCandidateSemanticEdges(db, enabledEmbedding);
  const confirmedEdges = countConfirmedEdges(db);
  const failed = embedding.lastError ? 1 : 0;
  const status = failed > 0 ? "failed" : pending + stale > 0 ? "stale" : "enabled";

  return {
    status,
    provider: enabledEmbedding.provider,
    model: enabledEmbedding.model,
    pending,
    failed,
    stale,
    candidateEdges,
    confirmedEdges,
    pendingSemanticEdgeBlocks: pending + stale
  };
}

export function semanticCandidateRelations(): string[] {
  return [...CANDIDATE_SEMANTIC_RELATIONS];
}

function enabledEmbeddingConfig(config: ContextGraphConfig): EmbeddingConfig & { model: string } {
  const embedding = config.embedding;
  if (!embedding?.enabled || embedding.provider === "none" || !embedding.model) {
    throw new Error("Embedding is disabled. Run: contextgraph embedding enable --provider <provider> --model <model>");
  }
  return embedding as EmbeddingConfig & { model: string };
}

function createProvider(config: EmbeddingConfig & { model: string }): EmbeddingProvider {
  if (config.provider === "openai-compatible-local-endpoint") {
    return {
      provider: config.provider,
      model: config.model,
      embed: (texts) => embedWithOpenAICompatibleEndpoint(config, texts)
    };
  }
  if (config.provider === "ollama") {
    return {
      provider: config.provider,
      model: config.model,
      embed: (texts) => embedWithOllama(config, texts)
    };
  }
  throw new Error(`Embedding provider "${config.provider}" is not available in this build.`);
}

async function embedWithOpenAICompatibleEndpoint(config: EmbeddingConfig & { model: string }, texts: string[]): Promise<number[][]> {
  const endpoint = config.endpoint ?? "http://127.0.0.1:11434/v1/embeddings";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, input: texts })
  });
  if (!response.ok) {
    throw new Error(`Embedding endpoint failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ index?: number; embedding?: unknown }>;
  };
  const data = payload.data ?? [];
  return data
    .slice()
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
    .map((item) => assertVector(item.embedding));
}

async function embedWithOllama(config: EmbeddingConfig & { model: string }, texts: string[]): Promise<number[][]> {
  const endpoint = config.endpoint ?? "http://127.0.0.1:11434/api/embed";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.model, input: texts })
  });
  if (!response.ok) {
    throw new Error(`Ollama embedding endpoint failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    embeddings?: unknown;
    embedding?: unknown;
  };
  if (Array.isArray(payload.embeddings)) {
    return payload.embeddings.map(assertVector);
  }
  return [assertVector(payload.embedding)];
}

function assertVector(value: unknown): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    throw new Error("Embedding provider returned an invalid vector.");
  }
  return value;
}

function readExistingEmbeddings(db: ContextGraphDatabase, embedding: EmbeddingConfig & { model: string }): Map<string, string> {
  const rows = db
    .prepare("SELECT block_id, block_hash FROM embeddings WHERE provider = ? AND model = ?")
    .all(embedding.provider, embedding.model) as ExistingEmbedding[];
  return new Map(rows.map((row) => [row.block_id, row.block_hash]));
}

function upsertEmbedding(
  db: ContextGraphDatabase,
  embedding: EmbeddingConfig & { model: string },
  block: BlockForEmbedding,
  vector: number[],
  timestamp: string
): void {
  const nodeId = readPrimaryNodeId(db, block.id);
  db.prepare(
    `INSERT INTO embeddings (block_id, node_id, provider, model, dimensions, vector, block_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(block_id, provider, model) DO UPDATE SET
       node_id = excluded.node_id,
       dimensions = excluded.dimensions,
       vector = excluded.vector,
       block_hash = excluded.block_hash,
       updated_at = excluded.updated_at`
  ).run(block.id, nodeId, embedding.provider, embedding.model, vector.length, encodeVector(vector), block.hash, timestamp, timestamp);
}

function readPrimaryNodeId(db: ContextGraphDatabase, blockId: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM nodes
       WHERE block_id = ?
       ORDER BY CASE type
         WHEN 'Rule' THEN 0
         WHEN 'Test' THEN 1
         WHEN 'Failure' THEN 2
         WHEN 'Fix' THEN 3
         ELSE 9
       END, id
       LIMIT 1`
    )
    .get(blockId) as { id: string } | undefined;
  return row?.id ?? null;
}

function discoverCandidateSemanticEdges(
  db: ContextGraphDatabase,
  embedding: EmbeddingConfig & { model: string },
  changedBlocks: BlockForEmbedding[],
  options: Required<RebuildEmbeddingOptions>
): number {
  if (changedBlocks.length === 0) {
    return 0;
  }

  const changedBlockIds = new Set(changedBlocks.map((block) => block.id));
  deleteCandidateEdgesForBlocks(db, embedding, changedBlockIds);

  const rows = readEmbeddingRows(db, embedding);
  const changedRows = rows.filter((row) => changedBlockIds.has(row.blockId));
  const inserted = new Set<string>();
  const timestamp = new Date().toISOString();
  const insertEdge = db.prepare(
    `INSERT INTO edges (id, from_node, to_node, relation, confidence, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       confidence = excluded.confidence,
       metadata = excluded.metadata,
       created_at = excluded.created_at`
  );

  db.transaction(() => {
    for (const row of changedRows) {
      const vector = decodeVector(row.vector);
      const candidates = rows
        .filter((candidate) => candidate.blockId !== row.blockId)
        .map((candidate) => ({
          row: candidate,
          score: cosineSimilarity(vector, decodeVector(candidate.vector))
        }))
        .filter((candidate) => candidate.score >= options.similarityThreshold)
        .sort((left, right) => right.score - left.score)
        .slice(0, options.maxEdgesPerBlock);

      for (const candidate of candidates) {
        const [fromNode, toNode] =
          row.nodeId < candidate.row.nodeId ? [row.nodeId, candidate.row.nodeId] : [candidate.row.nodeId, row.nodeId];
        if (fromNode === toNode) continue;
        const id = stableId("edge", fromNode, "SEMANTICALLY_RELATED", toNode, embedding.provider, embedding.model);
        if (inserted.has(id)) continue;
        inserted.add(id);
        insertEdge.run(
          id,
          fromNode,
          toNode,
          "SEMANTICALLY_RELATED",
          candidate.score,
          JSON.stringify({
            status: "candidate",
            score: candidate.score,
            provider: embedding.provider,
            model: embedding.model,
            fromBlockId: row.blockId,
            toBlockId: candidate.row.blockId,
            fromBlockHash: row.blockHash,
            toBlockHash: candidate.row.blockHash
          }),
          timestamp
        );
      }
    }
  })();

  return inserted.size;
}

function readEmbeddingRows(db: ContextGraphDatabase, embedding: EmbeddingConfig & { model: string }): EmbeddingRow[] {
  const rows = db
    .prepare(
      `SELECT
         embeddings.block_id AS blockId,
         embeddings.block_hash AS blockHash,
         embeddings.vector AS vector,
         COALESCE(embeddings.node_id, nodes.id) AS nodeId
       FROM embeddings
       JOIN nodes ON nodes.block_id = embeddings.block_id
       WHERE embeddings.provider = ? AND embeddings.model = ?
       GROUP BY embeddings.block_id
       HAVING nodeId IS NOT NULL`
    )
    .all(embedding.provider, embedding.model) as EmbeddingRow[];
  return rows;
}

function deleteCandidateEdgesForBlocks(
  db: ContextGraphDatabase,
  embedding: EmbeddingConfig & { model: string },
  blockIds: Set<string>
): void {
  const rows = db
    .prepare(`SELECT id, metadata FROM edges WHERE relation IN (${CANDIDATE_SEMANTIC_RELATIONS.map(() => "?").join(", ")})`)
    .all(...CANDIDATE_SEMANTIC_RELATIONS) as Array<{ id: string; metadata: string | null }>;
  const deleteEdge = db.prepare("DELETE FROM edges WHERE id = ?");
  for (const row of rows) {
    const metadata = parseMetadata(row.metadata);
    if (metadata.provider !== embedding.provider || metadata.model !== embedding.model) {
      continue;
    }
    if (blockIds.has(String(metadata.fromBlockId ?? "")) || blockIds.has(String(metadata.toBlockId ?? ""))) {
      deleteEdge.run(row.id);
    }
  }
}

function countPendingEmbeddings(db: ContextGraphDatabase, embedding: EmbeddingConfig & { model: string }): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM blocks
       LEFT JOIN embeddings
         ON embeddings.block_id = blocks.id
        AND embeddings.provider = ?
        AND embeddings.model = ?
       WHERE embeddings.block_id IS NULL`
    )
    .get(embedding.provider, embedding.model) as { count: number };
  return Number(row.count);
}

function countStaleEmbeddings(db: ContextGraphDatabase, embedding: EmbeddingConfig & { model: string }): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM blocks
       JOIN embeddings
         ON embeddings.block_id = blocks.id
        AND embeddings.provider = ?
        AND embeddings.model = ?
       WHERE embeddings.block_hash != blocks.hash`
    )
    .get(embedding.provider, embedding.model) as { count: number };
  return Number(row.count);
}

function countCandidateSemanticEdges(db: ContextGraphDatabase, embedding: EmbeddingConfig & { model: string }): number {
  const rows = db
    .prepare(`SELECT metadata FROM edges WHERE relation IN (${CANDIDATE_SEMANTIC_RELATIONS.map(() => "?").join(", ")})`)
    .all(...CANDIDATE_SEMANTIC_RELATIONS) as Array<{ metadata: string | null }>;
  return rows.filter((row) => {
    const metadata = parseMetadata(row.metadata);
    return metadata.provider === embedding.provider && metadata.model === embedding.model && metadata.status === "candidate";
  }).length;
}

function countConfirmedEdges(db: ContextGraphDatabase): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM edges WHERE relation NOT IN (${CANDIDATE_SEMANTIC_RELATIONS.map(() => "?").join(", ")})`)
    .get(...CANDIDATE_SEMANTIC_RELATIONS) as { count: number };
  return Number(row.count);
}

function disabledEmbeddingSnapshot(): DerivedIndexSnapshot {
  return {
    status: "disabled",
    provider: "none",
    model: null,
    pending: 0,
    failed: 0,
    stale: 0,
    candidateEdges: 0,
    confirmedEdges: 0,
    pendingSemanticEdgeBlocks: 0
  };
}

function encodeVector(vector: number[]): Buffer {
  const buffer = Buffer.alloc(vector.length * 4);
  vector.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function decodeVector(buffer: Buffer): number[] {
  const vector: number[] = [];
  for (let offset = 0; offset < buffer.length; offset += 4) {
    vector.push(buffer.readFloatLE(offset));
  }
  return vector;
}

function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function batches<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function writeConfig(projectRoot: string, config: ContextGraphConfig): Promise<void> {
  await writeFile(path.join(projectRoot, ".contextgraph", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function writeEmbeddingError(projectRoot: string, config: ContextGraphConfig, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await writeConfig(projectRoot, {
    ...config,
    embedding: {
      ...(config.embedding ?? { enabled: false, provider: "none", model: null, dimensions: null }),
      lastError: message,
      updatedAt: new Date().toISOString()
    }
  });
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
