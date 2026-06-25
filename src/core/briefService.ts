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
  status: StatusSnapshot;
  warnings: string[];
  sections: {
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

export async function getBrief(projectRoot: string): Promise<ContextBrief> {
  const resolvedRoot = path.resolve(projectRoot);
  const status = await getContextStatus(resolvedRoot);
  const db = openDatabase(path.join(resolvedRoot, ".contextgraph", "graph.db"));
  const items = readBriefRows(db).map(toBriefItem);
  db.close();

  const uniqueItems = uniqueByContent(items);
  return {
    projectRoot: resolvedRoot,
    status,
    warnings: status.status === "Stale" ? ["ContextGraph is stale. Run contextgraph index before relying on brief."] : [],
    sections: {
      mustKnow: {
        title: "P0 Must Know",
        items: takeTop(uniqueItems.filter((item) => item.priority === "P0"), 6)
      },
      requiredWorkflow: {
        title: "P1 Required Workflow",
        items: takeTop(
          uniqueItems.filter(
            (item) =>
              item.priority === "P1" &&
              (item.type === "Rule" || item.type === "Test" || item.type === "Command" || item.type === "Workflow")
          ),
          6
        )
      },
      knownPitfalls: {
        title: "P1 Known Pitfalls",
        items: takeTop(
          uniqueItems.filter((item) => item.priority === "P1" && (item.type === "Failure" || item.type === "Fix")),
          6
        )
      },
      projectShape: {
        title: "P2 Project Shape",
        items: takeTop(
          uniqueItems.filter(
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
