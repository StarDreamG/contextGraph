import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { ContextGraphMcpRuntime, createMcpServer } from "../../src/mcp/server.js";
import { createTempProject } from "../helpers/project.js";

describe("mcp server", () => {
  it("creates a server exposing required tools", () => {
    const server = createMcpServer({ projectRoot: process.cwd() });

    expect(server).toBeDefined();
  });

  it("lazily refreshes diagnostics after init and index in the same runtime", async () => {
    const project = await createTempProject();
    try {
      const runtime = new ContextGraphMcpRuntime({ projectRoot: project.root });

      const beforeInit = await runtime.getStatus();
      expect(beforeInit.diagnostics.initialized).toBe(false);
      expect(beforeInit.diagnostics.indexed).toBe(false);
      expect(beforeInit.diagnostics.nextAction).toContain("contextgraph init");

      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试\n必须运行 npm test\n");
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const afterIndex = await runtime.getStatus();
      expect(afterIndex.diagnostics.initialized).toBe(true);
      expect(afterIndex.diagnostics.indexed).toBe(true);
      expect(afterIndex.status.contextIndex.status).toBe("Fresh");
      expect(afterIndex.diagnostics.nextAction).toBe("No action required.");

      const reloaded = await runtime.reload();
      expect(reloaded.reloadedAt).toBeTruthy();
      expect(reloaded.diagnostics.mcpProcess.lastReloadedAt).toBe(reloaded.reloadedAt);
      expect(reloaded.status.contextIndex.status).toBe("Fresh");
    } finally {
      await project.cleanup();
    }
  });

  it("returns actionable diagnostics instead of throwing before initialization", async () => {
    const project = await createTempProject();
    try {
      const runtime = new ContextGraphMcpRuntime({ projectRoot: project.root });
      const response = await runtime.getRelevantContext({ task: "测试要求" });

      expect(response.results).toEqual([]);
      expect(response.diagnostics.initialized).toBe(false);
      expect(response.warnings.join("\n")).toContain("ContextGraph is not initialized");
      expect(response.suggestions).toContain("run contextgraph init");
    } finally {
      await project.cleanup();
    }
  });

  it("uses MCP file scopes for relevant context", async () => {
    const project = await createTempProject();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 上传经验",
          "修改 src/upload.ts 必须运行 npm test -- upload。",
          "",
          "## 导出经验",
          "修改 src/export.ts 必须运行 npm test -- export。"
        ].join("\n")
      );
      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const runtime = new ContextGraphMcpRuntime({ projectRoot: project.root });
      const response = await runtime.getRelevantContext({ task: "相关测试", files: ["src/upload.ts"] });

      expect(response.results.length).toBeGreaterThan(0);
      expect(response.results.some((item) => item.relatedFiles.includes("src/upload.ts"))).toBe(true);
      expect(response.results.some((item) => item.testCommands.includes("npm test -- upload"))).toBe(true);
      expect(response.results.some((item) => item.content.includes("npm test -- export"))).toBe(false);
    } finally {
      await project.cleanup();
    }
  });
});
