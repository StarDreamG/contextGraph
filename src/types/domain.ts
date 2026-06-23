export type NodeType =
  | "Rule"
  | "Workflow"
  | "Command"
  | "Test"
  | "Decision"
  | "Failure"
  | "Fix"
  | "Environment"
  | "Preference"
  | "Note"
  | "AgentSession"
  | "File";

export type GraphStatus = "Fresh" | "Stale";
export type Reliability = "High" | "Medium" | "Low";

export interface PrivacyConfig {
  offline: true;
  allowRemoteLLM: false;
  redactSecrets: true;
}

export interface ContextGraphConfig {
  version: 1;
  projectName: string;
  sources: string[];
  ignore: string[];
  privacy: PrivacyConfig;
}

export interface SourceRecord {
  id: string;
  path: string;
  type: string;
  hash: string;
  gitHead: string | null;
  lastIndexedAt: string;
  metadata: Record<string, unknown>;
}

export interface BlockRecord {
  id: string;
  sourceId: string;
  path: string;
  blockType: string;
  title: string | null;
  content: string;
  hash: string;
  startLine: number | null;
  endLine: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NodeRecord {
  id: string;
  type: NodeType;
  title: string;
  content: string;
  sourceId: string | null;
  blockId: string | null;
  confidence: number;
  status: "confirmed" | "warning";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface QueryResult {
  type: NodeType;
  title: string;
  content: string;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
  confidence: number;
  status: string;
  rank: number;
}

export interface StatusSnapshot {
  status: GraphStatus;
  reliability: Reliability;
  lastIndexedAt: string | null;
  currentGitHead: string | null;
  indexedGitHead: string | null;
  sourceCount: number;
  blockCount: number;
  nodeCount: number;
  edgeCount: number;
  changedFiles: number;
  pendingBlocks: number;
  failedBlocks: number;
  conflicts: number;
  warnings: string[];
}
