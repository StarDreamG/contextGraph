import path from "node:path";
import { getContextStatus } from "./statusService.js";
import { openDatabase } from "../storage/database.js";
import type { QueryResult, StatusSnapshot } from "../types/domain.js";

export interface ContextQueryResponse {
  query: string;
  status: StatusSnapshot;
  results: QueryResult[];
  warnings: string[];
}

interface QueryRow {
  type: QueryResult["type"];
  title: string;
  content: string;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
  confidence: number;
  status: string;
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
  const rows = runQuery(db, ftsQuery);
  db.close();

  return {
    query: trimmed,
    status,
    results: rows.map((row) => ({
      type: row.type,
      title: row.title,
      content: excerpt(row.content),
      sourcePath: row.sourcePath,
      startLine: row.startLine,
      endLine: row.endLine,
      confidence: row.confidence,
      status: row.status,
      rank: row.rank
    })),
    warnings: status.status === "Stale" ? ["ContextGraph is stale. Results may be outdated."] : []
  };
}

function runQuery(db: ReturnType<typeof openDatabase>, ftsQuery: string): QueryRow[] {
  const sql = `
SELECT
  nodes.type AS type,
  nodes.title AS title,
  nodes.content AS content,
  blocks.path AS sourcePath,
  blocks.start_line AS startLine,
  blocks.end_line AS endLine,
  nodes.confidence AS confidence,
  nodes.status AS status,
  bm25(nodes_fts) AS rank
FROM nodes_fts
JOIN nodes ON nodes.id = nodes_fts.node_id
LEFT JOIN blocks ON blocks.id = nodes.block_id
WHERE nodes_fts MATCH ?
ORDER BY rank
LIMIT 10`;

  try {
    return db.prepare(sql).all(ftsQuery) as QueryRow[];
  } catch {
    return db.prepare(sql).all(quoteTerms(ftsQuery)) as QueryRow[];
  }
}

function toFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map(toFtsTerm)
    .join(" ");
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

function excerpt(content: string): string {
  return content.length <= 500 ? content : `${content.slice(0, 497)}...`;
}
