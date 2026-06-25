import { access } from "node:fs/promises";
import path from "node:path";
import { getContextStatus } from "./statusService.js";
import type { GraphStatus, Reliability } from "../types/domain.js";

export interface DoctorReport {
  projectRoot: string;
  nodeVersion: string;
  nodeSupported: boolean;
  sqliteNative: boolean;
  projectInitialized: boolean;
  indexStatus: GraphStatus;
  reliability: Reliability;
  sourceCount: number;
  nodeCount: number;
  edgeCount: number;
  warnings: string[];
}

export async function runDoctor(projectRoot: string): Promise<DoctorReport> {
  const resolvedRoot = path.resolve(projectRoot);
  const nodeVersion = process.versions.node;
  const nodeSupported = isSupportedNode(nodeVersion);
  const sqliteNative = await canLoadSqliteNative();
  const projectInitialized = await hasContextGraphFiles(resolvedRoot);
  const status = await getContextStatus(resolvedRoot);

  const warnings = [
    ...(!nodeSupported ? [`Unsupported Node.js ${nodeVersion}. Expected >=22 <25.`] : []),
    ...(!sqliteNative ? ["Could not load better-sqlite3 native module."] : []),
    ...status.warnings
  ];

  return {
    projectRoot: resolvedRoot,
    nodeVersion,
    nodeSupported,
    sqliteNative,
    projectInitialized,
    indexStatus: status.status,
    reliability: status.reliability,
    sourceCount: status.sourceCount,
    nodeCount: status.nodeCount,
    edgeCount: status.edgeCount,
    warnings
  };
}

function isSupportedNode(version: string): boolean {
  const major = Number(version.split(".")[0]);
  return major >= 22 && major < 25;
}

async function canLoadSqliteNative(): Promise<boolean> {
  try {
    await import("better-sqlite3");
    return true;
  } catch {
    return false;
  }
}

async function hasContextGraphFiles(projectRoot: string): Promise<boolean> {
  try {
    await access(path.join(projectRoot, ".contextgraph", "config.json"));
    await access(path.join(projectRoot, ".contextgraph", "graph.db"));
    return true;
  } catch {
    return false;
  }
}
