import path from "node:path";
import { getContextStatus } from "./statusService.js";
import { assessPriority, priorityRank } from "../indexing/priority.js";
import { buildQueryPlan, type QueryPlan } from "../query/queryPlanner.js";
import { openDatabase } from "../storage/database.js";
import type { Priority, QueryResult, StatusSnapshot } from "../types/domain.js";

export interface ContextQueryResponse {
  query: string;
  queryPlan: QueryPlan;
  status: StatusSnapshot;
  results: QueryResult[];
  warnings: string[];
  suggestions: string[];
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
  matchedQuery: string;
  matchedByExpandedQuery: boolean;
}

export async function queryContext(projectRoot: string, query: string): Promise<ContextQueryResponse> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    throw new Error("Query must not be empty.");
  }

  const status = await getContextStatus(projectRoot);
  const queryPlan = buildQueryPlan(trimmed);
  const db = openDatabase(path.join(projectRoot, ".contextgraph", "graph.db"));
  const directRows = runQueryForText(db, queryPlan.normalizedQuery, queryPlan.normalizedQuery, false);
  const rows = collectRows(db, queryPlan, directRows);
  db.close();

  const results = rows
    .map((row) => toQueryResult(row, status.status))
    .sort((left, right) => resultScore(right, queryPlan) - resultScore(left, queryPlan))
    .slice(0, 10);

  const warnings = status.status === "Stale" ? ["ContextGraph is stale. Results may be outdated."] : [];
  if (directRows.length === 0 && results.length > 0) {
    warnings.push("Original query had no direct matches. Returned results from expanded queries.");
  }
  if (results.length === 0) {
    warnings.push("No relevant context found.");
  }

  return {
    query: trimmed,
    queryPlan,
    status,
    results,
    warnings,
    suggestions:
      results.length === 0
        ? [
            "try a shorter entity query",
            "try a known port/config/file name",
            `run contextgraph explain-query "${trimmed.replaceAll('"', '\\"')}"`
          ]
        : []
  };
}

function collectRows(
  db: ReturnType<typeof openDatabase>,
  queryPlan: QueryPlan,
  directRows: QueryRow[]
): QueryRow[] {
  const rows = new Map<string, QueryRow>();
  for (const row of directRows) {
    rows.set(rowKey(row), row);
  }

  for (const expandedQuery of queryPlan.expandedQueries) {
    const matchedByExpandedQuery = expandedQuery !== queryPlan.normalizedQuery;
    for (const row of runQueryForText(db, expandedQuery, expandedQuery, matchedByExpandedQuery)) {
      const key = rowKey(row);
      const existing = rows.get(key);
      if (!existing || rowPreference(row, queryPlan) > rowPreference(existing, queryPlan)) {
        rows.set(key, row);
      }
    }
  }

  return [...rows.values()];
}

function runQueryForText(
  db: ReturnType<typeof openDatabase>,
  query: string,
  matchedQuery: string,
  matchedByExpandedQuery: boolean
): QueryRow[] {
  const rows = new Map<string, QueryRow>();
  const terms = queryTerms(query);
  const ftsQuery = toFtsQuery(query);

  for (const row of runFtsQuery(db, ftsQuery, matchedQuery, matchedByExpandedQuery)) {
    rows.set(row.id, row);
  }
  for (const row of runLikeQuery(db, terms, matchedQuery, matchedByExpandedQuery)) {
    if (!rows.has(row.id)) {
      rows.set(row.id, row);
    }
  }
  return [...rows.values()];
}

function runFtsQuery(
  db: ReturnType<typeof openDatabase>,
  ftsQuery: string,
  matchedQuery: string,
  matchedByExpandedQuery: boolean
): QueryRow[] {
  if (ftsQuery.length === 0) {
    return [];
  }

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
  bm25(nodes_fts) AS rank,
  ? AS matchedQuery,
  ? AS matchedByExpandedQuery
FROM nodes_fts
JOIN nodes ON nodes.id = nodes_fts.node_id
LEFT JOIN blocks ON blocks.id = nodes.block_id
WHERE nodes_fts MATCH ?
ORDER BY rank
LIMIT 50`;

  try {
    return db.prepare(sql).all(matchedQuery, Number(matchedByExpandedQuery), ftsQuery) as QueryRow[];
  } catch {
    return db.prepare(sql).all(matchedQuery, Number(matchedByExpandedQuery), quoteTerms(ftsQuery)) as QueryRow[];
  }
}

function runLikeQuery(
  db: ReturnType<typeof openDatabase>,
  terms: string[],
  matchedQuery: string,
  matchedByExpandedQuery: boolean
): QueryRow[] {
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
  0 AS rank,
  ? AS matchedQuery,
  ? AS matchedByExpandedQuery
FROM nodes
LEFT JOIN blocks ON blocks.id = nodes.block_id
WHERE ${clauses}
LIMIT 50`;

  return db.prepare(sql).all(matchedQuery, Number(matchedByExpandedQuery), ...params) as QueryRow[];
}

function toFtsQuery(query: string): string {
  return queryTerms(query)
    .map(toFtsTerm)
    .join(" OR ");
}

function queryTerms(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
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

function toQueryResult(row: QueryRow, freshness: QueryResult["freshness"]): QueryResult {
  const metadata = parseMetadata(row.metadata);
  const fallbackPriority = assessPriority(row.type, row.title, row.content);
  const priority = readPriority(metadata.priority) ?? fallbackPriority.priority;
  const lineRange =
    typeof row.startLine === "number" && typeof row.endLine === "number"
      ? { start: row.startLine, end: row.endLine }
      : null;
  return {
    type: row.type,
    title: row.title,
    content: excerpt(row.content),
    priority,
    priorityReason: typeof metadata.priorityReason === "string" ? metadata.priorityReason : fallbackPriority.reason,
    source: {
      type: row.sourcePath ? "indexed_source" : "unknown",
      path: row.sourcePath,
      lineRange
    },
    sourcePath: row.sourcePath,
    startLine: row.startLine,
    endLine: row.endLine,
    lineRange,
    confidence: row.confidence,
    status: row.status,
    freshness,
    rank: row.rank,
    matchedQuery: row.matchedQuery,
    matchedByExpandedQuery: Boolean(row.matchedByExpandedQuery)
  };
}

function resultScore(result: QueryResult, queryPlan: QueryPlan): number {
  let score = 0;
  if (!result.matchedByExpandedQuery) {
    score += 40;
  }
  score += entityMatchCount(`${result.title}\n${result.content}`, queryPlan) * 100;
  score += Math.max(0, 50 - priorityRank(result.priority) * 10);
  if (result.type === "Rule") {
    score += 25;
  }
  if (["EnvironmentFact", "TestRequirement", "Risk", "PortConstraint"].includes(result.type)) {
    score += 20;
  }
  if (result.sourcePath && /(^|\/)(AGENTS|CLAUDE)\.md$/i.test(result.sourcePath)) {
    score += 15;
  } else if (result.sourcePath?.startsWith("docs/")) {
    score += 10;
  }
  if (result.status === "deprecated" || result.status === "stale") {
    score -= 30;
  }
  score -= Math.max(0, result.rank);
  return score;
}

function rowPreference(row: QueryRow, queryPlan: QueryPlan): number {
  return resultScore(toQueryResult(row, "Fresh"), queryPlan);
}

function entityMatchCount(text: string, queryPlan: QueryPlan): number {
  const entities = [
    ...queryPlan.entities.numbers,
    ...queryPlan.entities.ports,
    ...queryPlan.entities.ips,
    ...queryPlan.entities.files,
    ...queryPlan.entities.configKeys
  ];
  return new Set(entities.filter((entity) => text.includes(entity))).size;
}

function rowKey(row: QueryRow): string {
  if (row.sourcePath) {
    return `${row.sourcePath}:${row.startLine ?? "?"}:${row.endLine ?? "?"}`;
  }
  return row.id;
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
