import Database from "better-sqlite3";
import { mkdir, writeFile } from "node:fs/promises";
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

  it("indexes context sources in nested project directories by default", async () => {
    const project = await createTempProject();
    try {
      await mkdir(path.join(project.root, "service-a"), { recursive: true });
      await mkdir(path.join(project.root, "service-a", "logs"), { recursive: true });
      await writeFile(path.join(project.root, "README.md"), "# Root project\n");
      await writeFile(path.join(project.root, "service-a", "pom.xml"), "<project><name>service-a</name></project>\n");
      await writeFile(path.join(project.root, "service-a", "logs", "api-access.log"), "noise\n");
      await initContextGraph(project.root);

      const result = await indexContextGraph(project.root);

      expect(result.sourcesScanned).toBeGreaterThanOrEqual(2);

      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const sources = db.prepare("SELECT path FROM sources ORDER BY path").all() as Array<{ path: string }>;
      expect(sources.map((source) => source.path)).toContain("service-a/pom.xml");
      expect(sources.map((source) => source.path)).not.toContain("service-a/logs/api-access.log");
      db.close();
    } finally {
      await project.cleanup();
    }
  });
});
