import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTEXTGRAPH_AGENT_SECTION,
  CONTEXTGRAPH_AGENT_SECTION_START,
  DEFAULT_CONFIG
} from "../config/defaults.js";
import { openDatabase } from "../storage/database.js";
import { migrate } from "../storage/schema.js";

export interface InitResult {
  projectRoot: string;
  createdGraphDir: string;
}

export async function initContextGraph(projectRoot: string): Promise<InitResult> {
  const graphDir = path.join(projectRoot, ".contextgraph");

  await mkdir(path.join(graphDir, "sessions"), { recursive: true });
  await mkdir(path.join(graphDir, "logs"), { recursive: true });
  await mkdir(path.join(graphDir, "snapshots"), { recursive: true });

  await writeFileIfMissing(path.join(graphDir, "config.json"), JSON.stringify(DEFAULT_CONFIG, null, 2));
  await writeFileIfMissing(
    path.join(graphDir, "status.json"),
    JSON.stringify({ status: "Stale", reliability: "Low", lastIndexedAt: null }, null, 2)
  );

  const db = openDatabase(path.join(graphDir, "graph.db"));
  migrate(db);
  db.close();

  await ensureAgentsSection(path.join(projectRoot, "AGENTS.md"));

  return { projectRoot, createdGraphDir: graphDir };
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, `${content}\n`, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") {
      throw error;
    }
  });
}

async function ensureAgentsSection(agentsPath: string): Promise<void> {
  const existing = await readFile(agentsPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return "";
    }
    throw error;
  });

  if (existing.includes(CONTEXTGRAPH_AGENT_SECTION_START)) {
    return;
  }

  const next =
    existing.trim().length === 0
      ? `${CONTEXTGRAPH_AGENT_SECTION}\n`
      : `${existing.trimEnd()}\n\n${CONTEXTGRAPH_AGENT_SECTION}\n`;
  await writeFile(agentsPath, next);
}
