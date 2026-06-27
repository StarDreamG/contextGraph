import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { mergePresetSources } from "../config/presets.js";
import { currentGitHead } from "../git/gitState.js";
import { classifyBlock } from "../indexing/classifier.js";
import { extractExperienceFacts } from "../indexing/experience.js";
import { sha256, stableId } from "../indexing/hash.js";
import { buildEdgesForBlock } from "../indexing/relationships.js";
import { scanSources } from "../indexing/scanner.js";
import { parseJsonBlocks } from "../parsing/json.js";
import { parseMarkdownBlocks } from "../parsing/markdown.js";
import { parseTextBlocks } from "../parsing/text.js";
import type { ParsedBlock } from "../parsing/types.js";
import { redactSecrets } from "../security/redaction.js";
import { openDatabase } from "../storage/database.js";
import { GraphRepository } from "../storage/repositories.js";
import { migrate } from "../storage/schema.js";
import type { BlockRecord, ContextGraphConfig, NodeRecord, SourcePreset, SourceRecord, StatusSnapshot } from "../types/domain.js";
import { readEmbeddingIndexSnapshot } from "./embeddingService.js";
import { buildStatusSnapshot } from "./statusSnapshot.js";

const CURRENT_INDEX_VERSION = 2;

export interface IndexResult {
  presetsUsed: SourcePreset[];
  sourcesScanned: number;
  sourcesChanged: number;
  blocksIndexed: number;
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  currentHead: string | null;
  indexedHead: string | null;
  lastIndexedAt: string;
  status: "Fresh" | "Stale";
}

export interface IndexOptions {
  preset?: SourcePreset;
}

interface ExistingSource {
  id: string;
  path: string;
  hash: string;
}

export async function indexContextGraph(projectRoot: string, options: IndexOptions = {}): Promise<IndexResult> {
  const config = withIndexPreset(await loadConfig(projectRoot), options);
  const sourcePaths = await scanSources(projectRoot, config);
  const currentHead = await currentGitHead(projectRoot);
  const lastIndexedAt = new Date().toISOString();
  const db = openDatabase(path.join(projectRoot, ".contextgraph", "graph.db"));
  migrate(db);
  const repository = new GraphRepository(db);
  const existingSources = readExistingSources(db);
  const storedIndexVersion = readStatusValue<number>(db, "indexVersion", 0);
  const shouldRebuildDerivedData = storedIndexVersion < CURRENT_INDEX_VERSION;
  const seenSourceIds = new Set<string>();
  let sourcesChanged = 0;
  let blocksIndexed = 0;
  let nodesCreated = 0;
  let edgesCreated = 0;

  repository.transaction(() => {
    for (const relativePath of sourcePaths) {
      const absolutePath = path.join(projectRoot, relativePath);
      const raw = readFileSync(absolutePath, "utf8");
      const redacted = redactSecrets(raw);
      const sourceHash = sha256(redacted);
      const sourceId = stableId("source", relativePath);
      seenSourceIds.add(sourceId);

      if (!shouldRebuildDerivedData && existingSources.get(sourceId)?.hash === sourceHash) {
        continue;
      }

      sourcesChanged += 1;
      const parsedBlocks = parseSource(relativePath, redacted);
      const source: SourceRecord = {
        id: sourceId,
        path: relativePath,
        type: sourceType(relativePath),
        hash: sourceHash,
        gitHead: currentHead,
        lastIndexedAt,
        metadata: {}
      };
      const blocks = toBlockRecords(source, parsedBlocks, lastIndexedAt);
      const nodesByBlock = blocks.map((block) => ({
        block,
        nodes: toNodeRecords(
          block,
          classifyBlock({
            title: block.title,
            content: block.content,
            sourceId: block.sourceId,
            blockId: block.id
          }),
          lastIndexedAt
        )
      }));
      const nodes = nodesByBlock.flatMap((entry) => entry.nodes);
      const edges = nodesByBlock.flatMap((entry) => buildEdgesForBlock(entry.nodes, lastIndexedAt));

      repository.upsertSource(source);
      repository.replaceBlocksNodesAndEdges(source.id, blocks, nodes, edges);
      blocksIndexed += blocks.length;
      nodesCreated += nodes.length;
      edgesCreated += edges.length;
    }

    repository.deleteSourcesExcept([...seenSourceIds]);
  });

  const counts = repository.counts();
  const embeddingIndex = readEmbeddingIndexSnapshot(db, config);
  const snapshot: StatusSnapshot = buildStatusSnapshot({
    indexVersion: CURRENT_INDEX_VERSION,
    status: "Fresh",
    reliability: "High",
    lastIndexedAt,
    currentGitHead: currentHead,
    indexedGitHead: currentHead,
    sourceCount: counts.sources,
    blockCount: counts.blocks,
    nodeCount: counts.nodes,
    edgeCount: counts.edges,
    changedFiles: 0,
    pendingBlocks: 0,
    failedBlocks: 0,
    conflicts: 0,
    warnings: [],
    embeddingIndex,
    searchMode: embeddingIndex.status === "enabled" ? "hybrid" : "FTS + trigram"
  });
  repository.setStatus(snapshot);
  db.close();
  await writeFile(path.join(projectRoot, ".contextgraph", "status.json"), `${JSON.stringify(snapshot, null, 2)}\n`);

  return {
    presetsUsed: config.presets ?? [],
    sourcesScanned: sourcePaths.length,
    sourcesChanged,
    blocksIndexed,
    nodesCreated,
    nodesUpdated: 0,
    edgesCreated,
    currentHead,
    indexedHead: currentHead,
    lastIndexedAt,
    status: "Fresh"
  };
}

function withIndexPreset(config: ContextGraphConfig, options: IndexOptions): ContextGraphConfig {
  if (!options.preset) {
    return config;
  }
  const presets = [...(config.presets ?? []), options.preset].filter(
    (preset, index, values) => values.indexOf(preset) === index
  );
  return {
    ...config,
    presets,
    sources: mergePresetSources(config.sources, [options.preset])
  };
}

function readExistingSources(db: ReturnType<typeof openDatabase>): Map<string, ExistingSource> {
  const rows = db.prepare("SELECT id, path, hash FROM sources").all() as ExistingSource[];
  return new Map(rows.map((row) => [row.id, row]));
}

function readStatusValue<T>(db: ReturnType<typeof openDatabase>, key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM status WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) {
    return fallback;
  }
  return JSON.parse(row.value) as T;
}

function parseSource(relativePath: string, content: string): ParsedBlock[] {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".md" || ext === ".mdc") {
    return parseMarkdownBlocks(relativePath, content);
  }
  if (ext === ".json") {
    return parseJsonBlocks(relativePath, content);
  }
  return parseTextBlocks(relativePath, content);
}

function sourceType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".md" || ext === ".mdc") return "markdown";
  if (ext === ".json") return "json";
  return "text";
}

function toBlockRecords(source: SourceRecord, blocks: ParsedBlock[], timestamp: string): BlockRecord[] {
  return blocks.map((block, index) => ({
    id: stableId("block", source.id, String(index), block.title ?? ""),
    sourceId: source.id,
    path: source.path,
    blockType: block.blockType,
    title: block.title,
    content: block.content,
    hash: sha256(block.content),
    startLine: block.startLine,
    endLine: block.endLine,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
}

function toNodeRecords(
  block: BlockRecord,
  drafts: ReturnType<typeof classifyBlock>,
  timestamp: string
): NodeRecord[] {
  const nodes = drafts.map((draft) => ({
    id: stableId("node", block.id, draft.type, sha256(draft.content)),
    type: draft.type,
    title: draft.title,
    content: draft.content,
    sourceId: block.sourceId,
    blockId: block.id,
    confidence: draft.confidence,
    status: draft.status,
    metadata: draft.metadata,
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  const experience = extractExperienceFacts(block.content);
  const fileNodes: NodeRecord[] = experience.files.map((file) => ({
    id: stableId("node", block.id, "File", file),
    type: "File",
    title: file,
    content: `Related file: ${file}`,
    sourceId: block.sourceId,
    blockId: block.id,
    confidence: 1,
    status: "confirmed",
    metadata: {
      sourceId: block.sourceId,
      blockId: block.id,
      filePath: file,
      relatedFiles: [file],
      testCommands: experience.testCommands,
      modules: experience.modules,
      priority: "P3",
      priorityReason: "related source file path"
    },
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  return [...nodes, ...fileNodes];
}
