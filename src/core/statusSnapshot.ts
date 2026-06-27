import type { DerivedIndexSnapshot, GraphStatus, Reliability, StatusSnapshot, WatcherSnapshot } from "../types/domain.js";
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
  embeddingIndex?: DerivedIndexSnapshot;
  extractorIndex?: DerivedIndexSnapshot;
  searchMode?: StatusSnapshot["searchMode"];
  watcher?: WatcherSnapshot;
}

export function buildStatusSnapshot(input: StatusSnapshotInput): StatusSnapshot {
  const embeddingIndex = input.embeddingIndex ?? disabledDerivedIndex();
  const extractorIndex = input.extractorIndex ?? disabledDerivedIndex();
  const overallReliability = combineReliability(input.reliability, embeddingIndex, extractorIndex);
  return {
    ...input,
    overallReliability,
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
    embeddingIndex,
    extractorIndex,
    searchMode: input.searchMode ?? "FTS + trigram",
    watcher: input.watcher ?? stoppedWatcher()
  };
}

function disabledDerivedIndex(): DerivedIndexSnapshot {
  return {
    status: "disabled",
    provider: "none",
    model: null,
    pending: 0,
    failed: 0,
    stale: 0,
    candidateEdges: 0,
    confirmedEdges: 0,
    pendingSemanticEdgeBlocks: 0
  };
}

function combineReliability(
  contextReliability: Reliability,
  embeddingIndex: DerivedIndexSnapshot,
  extractorIndex: DerivedIndexSnapshot
): Reliability {
  if (contextReliability === "Low") {
    return "Low";
  }
  if (embeddingIndex.status === "failed" || extractorIndex.status === "failed") {
    return contextReliability === "High" ? "Medium" : contextReliability;
  }
  if (embeddingIndex.status === "stale" || extractorIndex.status === "stale") {
    return contextReliability === "High" ? "Medium" : contextReliability;
  }
  return contextReliability;
}
