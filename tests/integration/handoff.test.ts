import Database from "better-sqlite3";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { recordHandoff } from "../../src/core/handoffService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { createTempProject } from "../helpers/project.js";

describe("handoff", () => {
  it("creates a session and semantic nodes from summary", async () => {
    const project = await createTempProject();
    try {
      await initContextGraph(project.root);

      const result = await recordHandoff(project.root, {
        agent: "codex",
        task: "实现导出",
        summary: "已 fix failed test，需要运行 npm test",
        files: ["src/export.ts"]
      });

      expect(result.nodesCreated).toBeGreaterThanOrEqual(2);

      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const sessions = db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number };
      expect(sessions.count).toBe(1);
      const nodes = db.prepare("SELECT type, metadata FROM nodes").all() as Array<{ type: string; metadata: string }>;
      const failure = nodes.find((node) => node.type === "Failure");
      expect(failure ? JSON.parse(failure.metadata).priority : undefined).toBe("P1");
      db.close();
    } finally {
      await project.cleanup();
    }
  });
});
