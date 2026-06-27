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
      expect(brief.sections.p0Rules.items[0]?.priority).toBe("P0");
      expect(brief.sections.mustKnow.items[0]?.content).toContain("禁止接入互联网");
      expect(brief.sections.requiredWorkflow.items.some((item) => item.content.includes("npm test"))).toBe(true);
      expect(brief.sections.knownPitfalls.items.some((item) => item.content.includes("OOM"))).toBe(true);
      expect(brief.sections.projectShape.items.some((item) => item.content.includes("Node.js"))).toBe(true);
      expect(brief.sections.toolProfile.available).toBe(false);
    } finally {
      await project.cleanup();
    }
  });

  it("builds a task, file, and domain aware startup brief", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 全局铁律",
          "本项目禁止接入互联网，必须离线处理。",
          "",
          "## 区块链附件上传 Source of Truth",
          "区块链附件上传以 docs/blockchain-upload.md 为当前 source of truth。",
          "修改 src/blockchain/upload.ts 必须运行 npm test -- blockchain-upload。",
          "生产环境区块链网关端口不能修改，部署前必须确认回滚方案。",
          "历史失败：区块链附件上传曾 failed because txid 丢失，修复方案是保留回执映射。",
          "",
          "## 普通导出",
          "修改 src/export/report.ts 必须运行 npm test -- export。"
        ].join("\n")
      );
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const brief = await getBrief(project.root, {
        task: "修改区块链附件上传",
        file: "src/blockchain/upload.ts",
        domain: "blockchain"
      });

      expect(brief.request).toMatchObject({
        task: "修改区块链附件上传",
        file: "src/blockchain/upload.ts",
        domain: "blockchain"
      });
      expect(brief.sections.p0Rules.items.some((item) => item.content.includes("禁止接入互联网"))).toBe(true);
      expect(brief.sections.currentSourceOfTruth.items.some((item) => item.content.includes("docs/blockchain-upload.md"))).toBe(
        true
      );
      expect(brief.sections.requiredTests.items.some((item) => item.content.includes("npm test -- blockchain-upload"))).toBe(
        true
      );
      expect(brief.sections.environmentWarnings.items.some((item) => item.content.includes("生产环境"))).toBe(true);
      expect(brief.sections.knownFailureModes.items.some((item) => item.content.includes("txid 丢失"))).toBe(true);
      expect(brief.sections.relatedFiles.items.some((item) => item.content.includes("src/blockchain/upload.ts"))).toBe(true);
      expect(brief.sections.requiredTests.items.some((item) => item.content.includes("npm test -- export"))).toBe(false);
    } finally {
      await project.cleanup();
    }
  });
});
