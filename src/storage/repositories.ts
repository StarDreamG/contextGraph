import type { BlockRecord, NodeRecord, SourceRecord, StatusSnapshot } from "../types/domain.js";
import type { ContextGraphDatabase } from "./database.js";

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function countTable(db: ContextGraphDatabase, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return Number(row.count);
}

export class GraphRepository {
  constructor(private readonly db: ContextGraphDatabase) {}

  transaction<T>(callback: () => T): T {
    return this.db.transaction(callback)();
  }

  upsertSource(source: SourceRecord): void {
    this.db
      .prepare(
        `INSERT INTO sources (id, path, type, hash, git_head, last_indexed_at, metadata)
         VALUES (@id, @path, @type, @hash, @gitHead, @lastIndexedAt, @metadata)
         ON CONFLICT(id) DO UPDATE SET
           path = excluded.path,
           type = excluded.type,
           hash = excluded.hash,
           git_head = excluded.git_head,
           last_indexed_at = excluded.last_indexed_at,
           metadata = excluded.metadata`
      )
      .run({ ...source, metadata: json(source.metadata) });
  }

  replaceBlocksAndNodes(sourceId: string, blocks: BlockRecord[], nodes: NodeRecord[]): void {
    this.db
      .prepare(
        `DELETE FROM nodes_fts
         WHERE node_id IN (SELECT id FROM nodes WHERE source_id = ?)`
      )
      .run(sourceId);
    this.db.prepare("DELETE FROM blocks WHERE source_id = ?").run(sourceId);

    const insertBlock = this.db.prepare(
      `INSERT INTO blocks (id, source_id, path, block_type, title, content, hash, start_line, end_line, created_at, updated_at)
       VALUES (@id, @sourceId, @path, @blockType, @title, @content, @hash, @startLine, @endLine, @createdAt, @updatedAt)`
    );
    const insertNode = this.db.prepare(
      `INSERT INTO nodes (id, type, title, content, source_id, block_id, confidence, status, metadata, created_at, updated_at)
       VALUES (@id, @type, @title, @content, @sourceId, @blockId, @confidence, @status, @metadata, @createdAt, @updatedAt)`
    );
    const insertFts = this.db.prepare("INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)");

    for (const block of blocks) {
      insertBlock.run(block);
    }

    for (const node of nodes) {
      insertNode.run({ ...node, metadata: json(node.metadata) });
      insertFts.run(node.id, node.title, node.content);
    }
  }

  deleteSourcesExcept(sourceIds: string[]): void {
    if (sourceIds.length === 0) {
      this.db.prepare("DELETE FROM nodes_fts").run();
      this.db.prepare("DELETE FROM sources").run();
      return;
    }

    const placeholders = sourceIds.map(() => "?").join(", ");
    this.db
      .prepare(
        `DELETE FROM nodes_fts
         WHERE node_id IN (SELECT id FROM nodes WHERE source_id NOT IN (${placeholders}))`
      )
      .run(...sourceIds);
    this.db.prepare(`DELETE FROM sources WHERE id NOT IN (${placeholders})`).run(...sourceIds);
  }

  setStatus(snapshot: StatusSnapshot): void {
    const stmt = this.db.prepare(
      `INSERT INTO status (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    for (const [key, value] of Object.entries(snapshot)) {
      stmt.run(key, JSON.stringify(value));
    }
  }

  counts(): { sources: number; blocks: number; nodes: number; edges: number } {
    return {
      sources: countTable(this.db, "sources"),
      blocks: countTable(this.db, "blocks"),
      nodes: countTable(this.db, "nodes"),
      edges: countTable(this.db, "edges")
    };
  }
}
