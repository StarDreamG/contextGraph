import path from "node:path";
import { currentGitHead } from "../git/gitState.js";
import { classifyBlock } from "../indexing/classifier.js";
import { sha256, stableId } from "../indexing/hash.js";
import { openDatabase } from "../storage/database.js";
import { migrate } from "../storage/schema.js";
import type { NodeRecord, NodeType } from "../types/domain.js";

export interface HandoffInput {
  agent: string;
  task: string;
  summary: string;
  files?: string[];
}

export interface HandoffResult {
  sessionId: string;
  agent: string;
  task: string;
  gitHead: string | null;
  nodesCreated: number;
}

export async function recordHandoff(projectRoot: string, input: HandoffInput): Promise<HandoffResult> {
  const timestamp = new Date();
  const now = timestamp.toISOString();
  const gitHead = await currentGitHead(projectRoot);
  const sessionId = `${formatSessionTimestamp(timestamp)}-${slug(input.agent)}`;
  const db = openDatabase(path.join(projectRoot, ".contextgraph", "graph.db"));
  migrate(db);

  let nodesCreated = 0;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, agent, task, summary, git_head, started_at, ended_at, metadata)
       VALUES (@id, @agent, @task, @summary, @gitHead, @startedAt, @endedAt, @metadata)`
    ).run({
      id: sessionId,
      agent: input.agent,
      task: input.task,
      summary: input.summary,
      gitHead,
      startedAt: now,
      endedAt: now,
      metadata: JSON.stringify({ files: input.files ?? [] })
    });

    const sessionNode = makeNode({
      id: stableId("node", sessionId, "AgentSession"),
      type: "AgentSession",
      title: input.task,
      content: input.summary,
      metadata: { agent: input.agent, sessionId, gitHead, files: input.files ?? [] },
      timestamp: now
    });
    insertNode(db, sessionNode);
    nodesCreated += 1;

    const producedNodes = classifyBlock({
      title: input.task,
      content: input.summary,
      sourceId: sessionId,
      blockId: sessionId
    }).map((draft) =>
      makeNode({
        id: stableId("node", sessionId, draft.type, sha256(draft.content)),
        type: draft.type,
        title: draft.title,
        content: draft.content,
        metadata: { ...draft.metadata, sessionId },
        timestamp: now
      })
    );

    for (const node of producedNodes) {
      insertNode(db, node);
      insertEdge(db, sessionNode.id, node.id, "PRODUCED", now);
      nodesCreated += 1;
    }

    for (const file of input.files ?? []) {
      const normalized = file.split(path.sep).join("/");
      const fileNode = makeNode({
        id: stableId("node", sessionId, "File", normalized),
        type: "File",
        title: normalized,
        content: normalized,
        metadata: { sessionId, path: normalized },
        timestamp: now
      });
      insertNode(db, fileNode);
      insertEdge(db, sessionNode.id, fileNode.id, "RELATED_TO_FILE", now);
      nodesCreated += 1;
    }
  })();

  db.close();
  return { sessionId, agent: input.agent, task: input.task, gitHead, nodesCreated };
}

function makeNode(input: {
  id: string;
  type: NodeType;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}): NodeRecord {
  return {
    id: input.id,
    type: input.type,
    title: input.title,
    content: input.content,
    sourceId: null,
    blockId: null,
    confidence: 1,
    status: "confirmed",
    metadata: input.metadata,
    createdAt: input.timestamp,
    updatedAt: input.timestamp
  };
}

function insertNode(db: ReturnType<typeof openDatabase>, node: NodeRecord): void {
  db.prepare(
    `INSERT INTO nodes (id, type, title, content, source_id, block_id, confidence, status, metadata, created_at, updated_at)
     VALUES (@id, @type, @title, @content, @sourceId, @blockId, @confidence, @status, @metadata, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`
  ).run({ ...node, metadata: JSON.stringify(node.metadata) });
  db.prepare("DELETE FROM nodes_fts WHERE node_id = ?").run(node.id);
  db.prepare("INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)").run(
    node.id,
    node.title,
    node.content
  );
}

function insertEdge(db: ReturnType<typeof openDatabase>, fromNode: string, toNode: string, relation: string, now: string): void {
  db.prepare(
    `INSERT INTO edges (id, from_node, to_node, relation, confidence, metadata, created_at)
     VALUES (@id, @fromNode, @toNode, @relation, @confidence, @metadata, @createdAt)
     ON CONFLICT(id) DO NOTHING`
  ).run({
    id: stableId("edge", fromNode, relation, toNode),
    fromNode,
    toNode,
    relation,
    confidence: 1,
    metadata: "{}",
    createdAt: now
  });
}

function formatSessionTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes()
  )}${pad(date.getSeconds())}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "agent";
}
