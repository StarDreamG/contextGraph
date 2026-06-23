import Database from "better-sqlite3";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initContextGraph } from "../../src/core/initService.js";
import { indexContextGraph } from "../../src/core/indexService.js";
import { createTempProject } from "../helpers/project.js";

describe("index", () => {
  it("indexes AGENTS markdown into sources, blocks, nodes, and FTS", async () => {
    const project = await createTempProject();
    try {
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试规范\n修改导出必须运行 npm test\n");
      await initContextGraph(project.root);

      const result = await indexContextGraph(project.root);

      expect(result.sourcesScanned).toBeGreaterThanOrEqual(1);
      expect(result.nodesCreated).toBeGreaterThanOrEqual(1);

      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const nodes = db.prepare("SELECT type, content FROM nodes").all() as Array<{ type: string; content: string }>;
      const fts = db.prepare("SELECT node_id FROM nodes_fts").all() as Array<{ node_id: string }>;
      expect(nodes.some((node) => node.type === "Command" || node.type === "Test" || node.type === "Rule")).toBe(
        true
      );
      expect(fts.length).toBe(nodes.length);
      db.close();
    } finally {
      await project.cleanup();
    }
  });
});
