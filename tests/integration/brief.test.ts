import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getBrief } from "../../src/core/briefService.js";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { createTempProject } from "../helpers/project.js";

describe("brief", () => {
  it("groups the most important context for a new agent", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 安全规约",
          "本项目禁止接入互联网，必须离线处理。",
          "",
          "## 测试规范",
          "修改导出必须运行 npm test。",
          "",
          "## 踩坑",
          "之前导出大文件 failed because OOM。修复方案是分批导出。",
          "",
          "## 环境",
          "Node.js 使用 24。"
        ].join("\n")
      );
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const brief = await getBrief(project.root);

      expect(brief.sections.mustKnow.items[0]?.priority).toBe("P0");
      expect(brief.sections.mustKnow.items[0]?.content).toContain("禁止接入互联网");
      expect(brief.sections.requiredWorkflow.items.some((item) => item.content.includes("npm test"))).toBe(true);
      expect(brief.sections.knownPitfalls.items.some((item) => item.content.includes("OOM"))).toBe(true);
      expect(brief.sections.projectShape.items.some((item) => item.content.includes("Node.js"))).toBe(true);
      expect(brief.sections.toolProfile.available).toBe(false);
    } finally {
      await project.cleanup();
    }
  });
});
