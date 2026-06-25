import { stableId } from "./hash.js";
import type { EdgeRecord, NodeRecord } from "../types/domain.js";

export function buildEdgesForBlock(nodes: NodeRecord[], timestamp: string): EdgeRecord[] {
  const edges = new Map<string, EdgeRecord>();

  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      addEdge(edges, nodes[leftIndex], nodes[rightIndex], "co_occurs_with", timestamp);
    }
  }

  const failures = nodes.filter((node) => node.type === "Failure");
  const fixes = nodes.filter((node) => node.type === "Fix");
  for (const failure of failures) {
    for (const fix of fixes) {
      addEdge(edges, failure, fix, "fixed_by", timestamp);
    }
  }

  return [...edges.values()];
}

function addEdge(
  edges: Map<string, EdgeRecord>,
  from: NodeRecord,
  to: NodeRecord,
  relation: string,
  timestamp: string
): void {
  if (from.id === to.id) {
    return;
  }

  const id = stableId("edge", from.id, relation, to.id);
  edges.set(id, {
    id,
    fromNode: from.id,
    toNode: to.id,
    relation,
    confidence: 1,
    metadata: {
      blockId: from.blockId ?? to.blockId,
      sourceId: from.sourceId ?? to.sourceId
    },
    createdAt: timestamp
  });
}
