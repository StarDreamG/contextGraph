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
export type Priority = "P0" | "P1" | "P2" | "P3" | "P4";
export type DerivedIndexStatus = "disabled" | "enabled" | "stale" | "failed";
export type WatcherStatus = "stopped" | "watching" | "failed";

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

export interface EdgeRecord {
  id: string;
  fromNode: string;
  toNode: string;
  relation: string;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface QueryResult {
  type: NodeType;
  title: string;
  content: string;
  priority: Priority;
  priorityReason: string;
  sourcePath: string | null;
  startLine: number | null;
  endLine: number | null;
  confidence: number;
  status: string;
  rank: number;
  matchedQuery?: string;
  matchedByExpandedQuery?: boolean;
}

export interface ContextIndexSnapshot {
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
}

export interface DerivedIndexSnapshot {
  status: DerivedIndexStatus;
  provider: string;
  model: string | null;
  pending: number;
  failed: number;
  stale: number;
}

export interface WatcherSnapshot {
  status: WatcherStatus;
  mode: "disabled" | "local";
  message: string;
  pid?: number;
  startedAt?: string;
  updatedAt?: string;
  watchedSources?: number;
}

export interface StatusSnapshot {
  indexVersion?: number;
  status: GraphStatus;
  reliability: Reliability;
  overallReliability: Reliability;
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
  contextIndex: ContextIndexSnapshot;
  embeddingIndex: DerivedIndexSnapshot;
  extractorIndex: DerivedIndexSnapshot;
  searchMode: "FTS + trigram" | "hybrid";
  watcher: WatcherSnapshot;
}
