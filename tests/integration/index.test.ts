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
      await mkdir(path.join(project.root, ".local", "python", "test"), { recursive: true });
      await writeFile(path.join(project.root, "README.md"), "# Root project\n");
      await writeFile(path.join(project.root, "service-a", "pom.xml"), "<project><name>service-a</name></project>\n");
      await writeFile(path.join(project.root, "service-a", "logs", "api-access.log"), "noise\n");
      await writeFile(path.join(project.root, ".local", "python", "test", "test.pyc"), "binary noise\n");
      await initContextGraph(project.root);

      const result = await indexContextGraph(project.root);

      expect(result.sourcesScanned).toBeGreaterThanOrEqual(2);

      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const sources = db.prepare("SELECT path FROM sources ORDER BY path").all() as Array<{ path: string }>;
      expect(sources.map((source) => source.path)).toContain("service-a/pom.xml");
      expect(sources.map((source) => source.path)).not.toContain("service-a/logs/api-access.log");
      expect(sources.map((source) => source.path)).not.toContain(".local/python/test/test.pyc");
      db.close();
    } finally {
      await project.cleanup();
    }
  });

  it("assigns priority and creates relationships between nodes in the same context block", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 安全规约",
          "本项目禁止接入互联网，必须离线处理。",
          "之前导出大文件 failed because OOM。",
          "修复方案是分批导出并运行 npm test。"
        ].join("\n")
      );
      await initContextGraph(project.root);

      const result = await indexContextGraph(project.root);

      expect(result.edgesCreated).toBeGreaterThan(0);

      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const nodes = db.prepare("SELECT type, metadata FROM nodes").all() as Array<{
        type: string;
        metadata: string;
      }>;
      const rule = nodes.find((node) => node.type === "Rule");
      const failure = nodes.find((node) => node.type === "Failure");
      expect(rule ? JSON.parse(rule.metadata).priority : undefined).toBe("P0");
      expect(failure ? JSON.parse(failure.metadata).priority : undefined).toBe("P1");

      const edges = db.prepare("SELECT relation FROM edges ORDER BY relation").all() as Array<{ relation: string }>;
      expect(edges.map((edge) => edge.relation)).toContain("co_occurs_with");
      expect(edges.map((edge) => edge.relation)).toContain("fixed_by");
      db.close();
    } finally {
      await project.cleanup();
    }
  });

  it("can index API contract sources through the api preset without enabling source indexing", async () => {
    const project = await createTempProject();
    try {
      await mkdir(path.join(project.root, ".contextgraph"), { recursive: true });
      await writeFile(
        path.join(project.root, ".contextgraph", "config.json"),
        JSON.stringify(
          {
            version: 1,
            projectName: "api-demo",
            presets: ["basic"],
            sources: ["AGENTS.md"],
            ignore: [],
            privacy: {
              offline: true,
              allowRemoteLLM: false,
              redactSecrets: true
            }
          },
          null,
          2
        )
      );
      await writeFile(path.join(project.root, "AGENTS.md"), "## API\n接口契约以 OpenAPI 为准。\n");
      await writeFile(
        path.join(project.root, "openapi.json"),
        JSON.stringify({
          openapi: "3.0.0",
          paths: {
            "/blockchain/upload": {
              post: {
                summary: "Upload blockchain attachment",
                deprecated: false
              }
            }
          }
        })
      );
      await writeFile(path.join(project.root, "src.ts"), "export const implementation = true;\n");

      const result = await indexContextGraph(project.root, { preset: "api" });

      expect(result.presetsUsed).toEqual(expect.arrayContaining(["basic", "api"]));

      const db = new Database(path.join(project.root, ".contextgraph", "graph.db"));
      const sources = db.prepare("SELECT path FROM sources ORDER BY path").all() as Array<{ path: string }>;
      expect(sources.map((source) => source.path)).toContain("openapi.json");
      expect(sources.map((source) => source.path)).not.toContain("src.ts");
      db.close();
    } finally {
      await project.cleanup();
    }
  });
});
