import path from "node:path";
import { getContextStatus } from "./statusService.js";
import { assessPriority, priorityRank } from "../indexing/priority.js";
import { openDatabase } from "../storage/database.js";
import type { NodeType, Priority, StatusSnapshot } from "../types/domain.js";

export interface BriefItem {
  type: NodeType;
  title: string;
  content: string;
  priority: Priority;
  priorityReason: string;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

export interface BriefOptions {
  task?: string;
  file?: string;
  domain?: string;
}

export interface BriefSection {
  title: string;
  items: BriefItem[];
}

export interface ToolProfileSection {
  title: string;
  available: boolean;
  message: string;
}

export interface ContextBrief {
  projectRoot: string;
  request: BriefOptions;
  status: StatusSnapshot;
  warnings: string[];
  sections: {
    p0Rules: BriefSection;
    currentSourceOfTruth: BriefSection;
    requiredTests: BriefSection;
    environmentWarnings: BriefSection;
    recentHandoff: BriefSection;
    deprecatedContext: BriefSection;
    knownFailureModes: BriefSection;
    relatedFiles: BriefSection;
    mustKnow: BriefSection;
    requiredWorkflow: BriefSection;
    knownPitfalls: BriefSection;
    projectShape: BriefSection;
    toolProfile: ToolProfileSection;
  };
}

interface BriefRow {
  id: string;
  type: NodeType;
  title: string;
  content: string;
  metadata: string | null;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

export async function getBrief(projectRoot: string, options: BriefOptions = {}): Promise<ContextBrief> {
  const resolvedRoot = path.resolve(projectRoot);
  const status = await getContextStatus(resolvedRoot);
  const db = openDatabase(path.join(resolvedRoot, ".contextgraph", "graph.db"));
  const items = readBriefRows(db).map(toBriefItem);
  db.close();

  const uniqueItems = uniqueByContent(items);
  const relevantItems = filterRelevant(uniqueItems, options);
  const scopedItems = hasBriefScope(options) && relevantItems.length > 0 ? relevantItems : uniqueItems;
  const p0Rules: BriefSection = {
    title: "P0 Rules",
    items: takeTop(uniqueItems.filter((item) => item.priority === "P0"), 8)
  };
  const requiredTests: BriefSection = {
    title: "Required Tests",
    items: takeTop(scopedItems.filter(isRequiredTest), 8)
  };
  const knownFailureModes: BriefSection = {
    title: "Known Failure Modes",
    items: takeTop(scopedItems.filter(isKnownFailure), 8)
  };

  return {
    projectRoot: resolvedRoot,
    request: normalizeOptions(options),
    status,
    warnings: status.status === "Stale" ? ["ContextGraph is stale. Run contextgraph index before relying on brief."] : [],
    sections: {
      p0Rules,
      currentSourceOfTruth: {
        title: "Current Source of Truth",
        items: takeTop(scopedItems.filter(isSourceOfTruth), 8)
      },
      requiredTests,
      environmentWarnings: {
        title: "Deployment / Environment Warnings",
        items: takeTop(scopedItems.filter(isEnvironmentWarning), 8)
      },
      recentHandoff: {
        title: "Recent Handoff",
        items: takeTop(scopedItems.filter((item) => item.type === "AgentSession"), 5)
      },
      deprecatedContext: {
        title: "Deprecated / Conflicting Context",
        items: takeTop(scopedItems.filter(isDeprecatedOrConflicting), 8)
      },
      knownFailureModes,
      relatedFiles: {
        title: "Related Files",
        items: takeTop(scopedItems.filter((item) => mentionsFile(item) || fileMatches(item, options.file)), 8)
      },
      mustKnow: {
        title: "P0 Must Know",
        items: p0Rules.items
      },
      requiredWorkflow: {
        title: "P1 Required Workflow",
        items: takeTop(
          scopedItems.filter(
            (item) =>
              item.priority === "P1" &&
              (item.type === "Rule" || item.type === "Test" || item.type === "Command" || item.type === "Workflow")
          ),
          6
        )
      },
      knownPitfalls: {
        title: "P1 Known Pitfalls",
        items: knownFailureModes.items
      },
      projectShape: {
        title: "P2 Project Shape",
        items: takeTop(
          scopedItems.filter(
            (item) =>
              item.priority === "P2" &&
              (item.type === "Decision" ||
                item.type === "Environment" ||
                item.type === "Workflow" ||
                item.type === "Preference")
          ),
          6
        )
      },
      toolProfile: {
        title: "Tool Profile",
        available: false,
        message: "Tool profile is not imported yet. Run a future import-sessions/tool-profile step to populate it."
      }
    }
  };
}

function readBriefRows(db: ReturnType<typeof openDatabase>): BriefRow[] {
  return db
    .prepare(
      `SELECT
         nodes.id AS id,
         nodes.type AS type,
         nodes.title AS title,
         nodes.content AS content,
         nodes.metadata AS metadata,
         blocks.path AS sourcePath,
         blocks.start_line AS startLine,
         blocks.end_line AS endLine
       FROM nodes
       LEFT JOIN blocks ON blocks.id = nodes.block_id`
    )
    .all() as BriefRow[];
}

function toBriefItem(row: BriefRow): BriefItem {
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
    endLine: row.endLine
  };
}

function normalizeOptions(options: BriefOptions): BriefOptions {
  return {
    ...(options.task ? { task: options.task } : {}),
    ...(options.file ? { file: options.file } : {}),
    ...(options.domain ? { domain: options.domain } : {})
  };
}

function hasBriefScope(options: BriefOptions): boolean {
  return Boolean(options.task || options.file || options.domain);
}

function filterRelevant(items: BriefItem[], options: BriefOptions): BriefItem[] {
  if (!hasBriefScope(options)) {
    return items;
  }
  return items
    .map((item) => ({ item, score: relevanceScore(item, options) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.item);
}

function relevanceScore(item: BriefItem, options: BriefOptions): number {
  const haystack = briefHaystack(item);
  let score = 0;
  if (options.domain) {
    for (const term of domainTerms(options.domain)) {
      if (haystack.includes(term)) score += 4;
    }
  }
  if (options.file && fileMatches(item, options.file)) {
    score += 8;
  }
  for (const term of taskTerms(options.task)) {
    if (haystack.includes(term)) score += 2;
  }
  return score;
}

function domainTerms(domain: string): string[] {
  const normalized = domain.toLowerCase();
  const known: Record<string, string[]> = {
    blockchain: ["blockchain", "区块链", "txid", "链上"],
    deployment: ["deployment", "deploy", "部署", "生产", "环境"],
    testing: ["testing", "test", "测试", "验证"],
    frontend: ["frontend", "前端", "vue", "react"],
    backend: ["backend", "后端", "server", "api"]
  };
  return known[normalized] ?? [normalized];
}

function taskTerms(task: string | undefined): string[] {
  if (!task) return [];
  const terms = new Set<string>();
  for (const term of task.toLowerCase().split(/[^\p{L}\p{N}_./-]+/u)) {
    if (term.length >= 2) terms.add(term);
  }
  for (const known of ["区块链", "附件", "上传", "部署", "测试", "生产", "回滚", "导出"]) {
    if (task.includes(known)) terms.add(known);
  }
  return [...terms];
}

function uniqueByContent(items: BriefItem[]): BriefItem[] {
  const seen = new Set<string>();
  const result: BriefItem[] = [];
  for (const item of items) {
    const key = `${item.priority}:${item.type}:${item.title}:${item.content}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function takeTop(items: BriefItem[], limit: number): BriefItem[] {
  return [...items]
    .sort(
      (left, right) =>
        priorityRank(left.priority) - priorityRank(right.priority) ||
        typeRank(left.type) - typeRank(right.type) ||
        left.title.localeCompare(right.title)
    )
    .slice(0, limit);
}

function isSourceOfTruth(item: BriefItem): boolean {
  return /source of truth|权威|当前|入口|以 .+ 为|以.+为/i.test(briefHaystack(item));
}

function isRequiredTest(item: BriefItem): boolean {
  return item.type === "Test" || /\b(test|spec|vitest|playwright|junit|bruno)\b|测试|验证/i.test(briefHaystack(item));
}

function isEnvironmentWarning(item: BriefItem): boolean {
  return (
    item.type === "Environment" ||
    /生产|环境|部署|端口|docker|nginx|回滚|风险|warning|production|deploy|rollback/i.test(briefHaystack(item))
  );
}

function isKnownFailure(item: BriefItem): boolean {
  return item.type === "Failure" || item.type === "Fix" || /失败|踩坑|报错|failed|failure|fix|修复/i.test(briefHaystack(item));
}

function isDeprecatedOrConflicting(item: BriefItem): boolean {
  return /deprecated|stale|conflict|supersedes|废弃|过期|冲突|替代/i.test(briefHaystack(item));
}

function mentionsFile(item: BriefItem): boolean {
  return /\b[\w.-]+\/[\w./-]+\.[A-Za-z0-9]+\b/.test(briefHaystack(item));
}

function fileMatches(item: BriefItem, file: string | undefined): boolean {
  if (!file) return false;
  return briefHaystack(item).includes(file.toLowerCase());
}

function briefHaystack(item: BriefItem): string {
  return `${item.title}\n${item.content}\n${item.sourcePath ?? ""}`.toLowerCase();
}

function typeRank(type: NodeType): number {
  const ranks: Partial<Record<NodeType, number>> = {
    Rule: 0,
    Failure: 1,
    Fix: 2,
    Test: 3,
    Command: 4,
    Decision: 5,
    Environment: 6,
    Workflow: 7,
    Preference: 8
  };
  return ranks[type] ?? 99;
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
  return content.length <= 280 ? content : `${content.slice(0, 277)}...`;
}
