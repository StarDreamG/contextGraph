import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/storage/database.js";
import { migrate } from "../../src/storage/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "contextgraph-storage-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("storage schema", () => {
  it("creates required tables and FTS index", () => {
    const db = openDatabase(path.join(tempDir, "graph.db"));
    migrate(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual') ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toContain("sources");
    expect(tables).toContain("blocks");
    expect(tables).toContain("nodes");
    expect(tables).toContain("edges");
    expect(tables).toContain("sessions");
    expect(tables).toContain("status");
    expect(tables).toContain("nodes_fts");
    db.close();
  });
});
