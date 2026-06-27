import type { GraphStatus, Reliability, StatusSnapshot, WatcherSnapshot } from "../types/domain.js";
import { stoppedWatcher } from "./watchState.js";

export interface StatusSnapshotInput {
  indexVersion?: number;
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
  watcher?: WatcherSnapshot;
}

export function buildStatusSnapshot(input: StatusSnapshotInput): StatusSnapshot {
  return {
    ...input,
    overallReliability: input.reliability,
    contextIndex: {
      status: input.status,
      reliability: input.reliability,
      lastIndexedAt: input.lastIndexedAt,
      currentGitHead: input.currentGitHead,
      indexedGitHead: input.indexedGitHead,
      sourceCount: input.sourceCount,
      blockCount: input.blockCount,
      nodeCount: input.nodeCount,
      edgeCount: input.edgeCount,
      changedFiles: input.changedFiles,
      pendingBlocks: input.pendingBlocks,
      failedBlocks: input.failedBlocks,
      conflicts: input.conflicts
    },
    embeddingIndex: {
      status: "disabled",
      provider: "none",
      model: null,
      pending: 0,
      failed: 0,
      stale: 0
    },
    extractorIndex: {
      status: "disabled",
      provider: "none",
      model: null,
      pending: 0,
      failed: 0,
      stale: 0
    },
    searchMode: "FTS + trigram",
    watcher: input.watcher ?? stoppedWatcher()
  };
}
