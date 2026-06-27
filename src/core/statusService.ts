import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { currentGitHead } from "../git/gitState.js";
import { sha256, stableId } from "../indexing/hash.js";
import { scanSources } from "../indexing/scanner.js";
import { redactSecrets } from "../security/redaction.js";
import { openDatabase } from "../storage/database.js";
import { GraphRepository } from "../storage/repositories.js";
import type { StatusSnapshot } from "../types/domain.js";
import { buildStatusSnapshot } from "./statusSnapshot.js";

interface IndexedSource {
  id: string;
  path: string;
  hash: string;
}

export async function getContextStatus(projectRoot: string): Promise<StatusSnapshot> {
  const dbPath = path.join(projectRoot, ".contextgraph", "graph.db");
  const configPath = path.join(projectRoot, ".contextgraph", "config.json");
  const currentHead = await currentGitHead(projectRoot);

  try {
    await access(dbPath);
    await access(configPath);
  } catch {
    return staleLow({
      currentHead,
      warnings: ["ContextGraph is not initialized. Run: contextgraph init"]
    });
  }

  const config = await loadConfig(projectRoot);
  const currentSourcePaths = await scanSources(projectRoot, config);
  const db = openDatabase(dbPath);
  const repository = new GraphRepository(db);
  const counts = repository.counts();
  const indexedSources = readIndexedSources(db);
  const indexedById = new Map(indexedSources.map((source) => [source.id, source]));
  const currentIds = new Set<string>();
  let changedFiles = 0;

  for (const relativePath of currentSourcePaths) {
    const sourceId = stableId("source", relativePath);
    currentIds.add(sourceId);
    const currentHash = sha256(redactSecrets(await readFile(path.join(projectRoot, relativePath), "utf8")));
    if (indexedById.get(sourceId)?.hash !== currentHash) {
      changedFiles += 1;
    }
  }

  for (const indexed of indexedSources) {
    if (!currentIds.has(indexed.id)) {
      changedFiles += 1;
    }
  }

  const indexedHead = readStatusValue<string | null>(db, "indexedGitHead", null);
  const lastIndexedAt = readStatusValue<string | null>(db, "lastIndexedAt", null);
  const failedBlocks = readStatusValue<number>(db, "failedBlocks", 0);
  db.close();

  const headChanged = currentHead !== indexedHead;
  const isStale = changedFiles > 0 || headChanged;
  const reliability = isStale ? "Low" : failedBlocks > 0 ? "Medium" : "High";

  return buildStatusSnapshot({
    status: isStale ? "Stale" : "Fresh",
    reliability,
    lastIndexedAt,
    currentGitHead: currentHead,
    indexedGitHead: indexedHead,
    sourceCount: counts.sources,
    blockCount: counts.blocks,
    nodeCount: counts.nodes,
    edgeCount: counts.edges,
    changedFiles,
    pendingBlocks: 0,
    failedBlocks,
    conflicts: 0,
    warnings: isStale ? ["ContextGraph is not up to date. Run: contextgraph index"] : []
  });
}

function staleLow(input: { currentHead: string | null; warnings: string[] }): StatusSnapshot {
  return buildStatusSnapshot({
    status: "Stale",
    reliability: "Low",
    lastIndexedAt: null,
    currentGitHead: input.currentHead,
    indexedGitHead: null,
    sourceCount: 0,
    blockCount: 0,
    nodeCount: 0,
    edgeCount: 0,
    changedFiles: 0,
    pendingBlocks: 0,
    failedBlocks: 0,
    conflicts: 0,
    warnings: input.warnings
  });
}

function readIndexedSources(db: ReturnType<typeof openDatabase>): IndexedSource[] {
  return db.prepare("SELECT id, path, hash FROM sources").all() as IndexedSource[];
}

function readStatusValue<T>(db: ReturnType<typeof openDatabase>, key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM status WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) {
    return fallback;
  }
  return JSON.parse(row.value) as T;
}
