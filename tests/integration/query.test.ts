import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { queryContext } from "../../src/core/queryService.js";
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

      const multiTerm = await queryContext(project.root, "导出 测试");
      expect(multiTerm.results.length).toBeGreaterThan(0);
      expect(multiTerm.results.some((item) => item.content.includes("导出"))).toBe(true);
    } finally {
      await project.cleanup();
    }
  });
});
