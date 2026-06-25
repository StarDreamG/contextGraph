import path from "node:path";
import { getContextStatus } from "./statusService.js";
import { assessPriority, priorityRank } from "../indexing/priority.js";
import { openDatabase } from "../storage/database.js";
import type { Priority, QueryResult, StatusSnapshot } from "../types/domain.js";

export interface ContextQueryResponse {
  query: string;
  status: StatusSnapshot;
  results: QueryResult[];
  warnings: string[];
}

interface QueryRow {
  id: string;
  type: QueryResult["type"];
  title: string;
  content: string;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
  confidence: number;
  status: string;
  metadata: string | null;
  rank: number;
}

export async function queryContext(projectRoot: string, query: string): Promise<ContextQueryResponse> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("Query must not be empty.");
  }

  const status = await getContextStatus(projectRoot);
  const db = openDatabase(path.join(projectRoot, ".contextgraph", "graph.db"));
  const ftsQuery = toFtsQuery(trimmed);
  const rows = runQuery(db, ftsQuery, queryTerms(trimmed));
  db.close();

  const results = rows
    .map(toQueryResult)
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.rank - right.rank)
    .slice(0, 10);

  return {
    query: trimmed,
    status,
    results,
    warnings: status.status === "Stale" ? ["ContextGraph is stale. Results may be outdated."] : []
  };
}

function runQuery(db: ReturnType<typeof openDatabase>, ftsQuery: string, terms: string[]): QueryRow[] {
  const rows = new Map<string, QueryRow>();
  for (const row of runFtsQuery(db, ftsQuery)) {
    rows.set(row.id, row);
  }
  for (const row of runLikeQuery(db, terms)) {
    if (!rows.has(row.id)) {
      rows.set(row.id, row);
    }
  }
  return [...rows.values()];
}

function runFtsQuery(db: ReturnType<typeof openDatabase>, ftsQuery: string): QueryRow[] {
  const sql = `
SELECT
  nodes.id AS id,
  nodes.type AS type,
  nodes.title AS title,
  nodes.content AS content,
  blocks.path AS sourcePath,
  blocks.start_line AS startLine,
  blocks.end_line AS endLine,
  nodes.confidence AS confidence,
  nodes.status AS status,
  nodes.metadata AS metadata,
  bm25(nodes_fts) AS rank
FROM nodes_fts
JOIN nodes ON nodes.id = nodes_fts.node_id
LEFT JOIN blocks ON blocks.id = nodes.block_id
WHERE nodes_fts MATCH ?
ORDER BY rank
LIMIT 50`;

  try {
    return db.prepare(sql).all(ftsQuery) as QueryRow[];
  } catch {
    return db.prepare(sql).all(quoteTerms(ftsQuery)) as QueryRow[];
  }
}

function runLikeQuery(db: ReturnType<typeof openDatabase>, terms: string[]): QueryRow[] {
  if (terms.length === 0) {
    return [];
  }

  const clauses = terms.map(() => "(nodes.title LIKE ? OR nodes.content LIKE ?)").join(" OR ");
  const params = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
  const sql = `
SELECT
  nodes.id AS id,
  nodes.type AS type,
  nodes.title AS title,
  nodes.content AS content,
  blocks.path AS sourcePath,
  blocks.start_line AS startLine,
  blocks.end_line AS endLine,
  nodes.confidence AS confidence,
  nodes.status AS status,
  nodes.metadata AS metadata,
  0 AS rank
FROM nodes
LEFT JOIN blocks ON blocks.id = nodes.block_id
WHERE ${clauses}
LIMIT 50`;

  return db.prepare(sql).all(...params) as QueryRow[];
}

function toFtsQuery(query: string): string {
  return queryTerms(query)
    .map(toFtsTerm)
    .join(" OR ");
}

function queryTerms(query: string): string[] {
  return query.split(/\s+/).filter(Boolean);
}

function toFtsTerm(term: string): string {
  const cleaned = term.replaceAll('"', "").trim();
  if (/^[\p{L}\p{N}_]+$/u.test(cleaned)) {
    return `${cleaned}*`;
  }
  return `"${term.replaceAll('"', '""')}"`;
}

function quoteTerms(query: string): string {
  return `"${query.replaceAll('"', '""')}"`;
}

function toQueryResult(row: QueryRow): QueryResult {
  const metadata = parseMetadata(row.metadata);
  const fallbackPriority = assessPriority(row.type, row.title, row.content);
  const priority = readPriority(metadata.priority) ?? fallbackPriority.priority;
  return {
    type: row.type,
    title: row.title,
    content: excerpt(row.content),
    priority,
    priorityReason: typeof metadata.priorityReason === "string" ? metadata.priorityReason : fallbackPriority.reason,
    sourcePath: row.sourcePath,
    startLine: row.startLine,
    endLine: row.endLine,
    confidence: row.confidence,
    status: row.status,
    rank: row.rank
  };
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

function readPriority(value: unknown): Priority | null {
  return value === "P0" || value === "P1" || value === "P2" || value === "P3" || value === "P4" ? value : null;
}

function excerpt(content: string): string {
  return content.length <= 500 ? content : `${content.slice(0, 497)}...`;
}
