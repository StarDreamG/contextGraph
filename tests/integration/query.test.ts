import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { queryContext } from "../../src/core/queryService.js";
import { openDatabase } from "../../src/storage/database.js";
import { createTempProject } from "../helpers/project.js";

describe("query", () => {
  it("returns relevant FTS context with source evidence", async () => {
    const project = await createTempProject();
    try {
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试规范\n修改导出必须运行 npm test\n");
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const result = await queryContext(project.root, "测试");

      expect(result.status.status).toBe("Fresh");
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0]?.sourcePath).toBe("AGENTS.md");
      expect(result.results[0]).toMatchObject({
        source: {
          path: "AGENTS.md",
          type: "indexed_source"
        },
        lineRange: {
          start: expect.any(Number),
          end: expect.any(Number)
        },
        freshness: "Fresh",
        matchedQuery: expect.any(String),
        matchedByExpandedQuery: expect.any(Boolean)
      });

      const multiTerm = await queryContext(project.root, "导出 测试");
      expect(multiTerm.results.length).toBeGreaterThan(0);
      expect(multiTerm.results.some((item) => item.content.includes("导出"))).toBe(true);
    } finally {
      await project.cleanup();
    }
  });

  it("returns high priority rules ahead of ordinary notes", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        "## 安全规约\n本项目禁止接入互联网，必须离线处理。\n\n## 背景\n互联网访问只是背景描述。\n"
      );
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const result = await queryContext(project.root, "禁止 互联网");

      expect(result.results[0]?.priority).toBe("P0");
      expect(result.results[0]?.type).toBe("Rule");
    } finally {
      await project.cleanup();
    }
  });

  it("uses expanded natural language queries when the original query has no direct matches", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 智策星隔离",
          "智策星必须隔离运行。",
          "端口 61192 已被占用，不得占用该端口和相关资源。"
        ].join("\n")
      );
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const result = await queryContext(project.root, "智策星隔离要求，不能占用哪些端口和资源");

      expect(result.queryPlan.expandedQueries).toEqual(
        expect.arrayContaining(["智策星 隔离", "智策星 端口", "智策星 资源", "不能占用 端口"])
      );
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.some((item) => item.sourcePath === "AGENTS.md")).toBe(true);
      expect(result.results.some((item) => item.matchedQuery && item.matchedQuery !== result.query)).toBe(true);
      expect(result.warnings).toContain("Original query had no direct matches. Returned results from expanded queries.");
    } finally {
      await project.cleanup();
    }
  });

  it("returns query plan details and suggestions when all retrieval attempts miss", async () => {
    const project = await createTempProject();
    try {
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试规范\n修改导出必须运行 npm test\n");
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const result = await queryContext(project.root, "完全不存在的客户隔离端口 65530");

      expect(result.results).toHaveLength(0);
      expect(result.queryPlan.normalizedQuery).toBe("完全不存在的客户隔离端口 65530");
      expect(result.queryPlan.expandedQueries.length).toBeGreaterThan(0);
      expect(result.warnings).toContain("No relevant context found.");
      expect(result.suggestions).toEqual(
        expect.arrayContaining(["try a shorter entity query", "try a known port/config/file name"])
      );
    } finally {
      await project.cleanup();
    }
  });

  it("returns file and module scoped project experience without claiming code intelligence", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 区块链上传模块",
          "修改 src/blockchain/upload.ts 必须运行 npm test -- blockchain-upload。",
          "upload 模块历史失败：failed because txid 丢失，修复方案是保留回执映射。",
          "",
          "## 普通导出模块",
          "修改 src/export/report.ts 必须运行 npm test -- export。"
        ].join("\n")
      );
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const byFile = await queryContext(project.root, "相关规约", { file: "src/blockchain/upload.ts" });
      expect(byFile.results.length).toBeGreaterThan(0);
      expect(byFile.results.some((item) => item.relatedFiles.includes("src/blockchain/upload.ts"))).toBe(true);
      expect(byFile.results.some((item) => item.testCommands.includes("npm test -- blockchain-upload"))).toBe(true);
      expect(byFile.results.some((item) => item.content.includes("npm test -- export"))).toBe(false);

      const byModule = await queryContext(project.root, "历史失败", { module: "upload" });
      expect(byModule.results.some((item) => item.modules.includes("upload"))).toBe(true);
      expect(byModule.results.some((item) => item.content.includes("txid 丢失"))).toBe(true);

      const db = openDatabase(path.join(project.root, ".contextgraph", "graph.db"));
      try {
        const relations = db
          .prepare("SELECT DISTINCT relation FROM edges WHERE relation IN ('RELATED_TO_FILE', 'APPLIES_TO', 'REQUIRES_TEST')")
          .all() as Array<{ relation: string }>;
        expect(relations.map((row) => row.relation).sort()).toEqual([
          "APPLIES_TO",
          "RELATED_TO_FILE",
          "REQUIRES_TEST"
        ]);
      } finally {
        db.close();
      }
    } finally {
      await project.cleanup();
    }
  });
});
