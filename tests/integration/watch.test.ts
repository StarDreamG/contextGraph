import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { queryContext } from "../../src/core/queryService.js";
import { getContextStatus } from "../../src/core/statusService.js";
import { startContextGraphWatcher } from "../../src/core/watchService.js";
import { createTempProject } from "../helpers/project.js";

describe("watch", () => {
  it("reports watcher state and reindexes changed sources", async () => {
    const project = await createTempProject();
    try {
      const agentsPath = path.join(project.root, "AGENTS.md");
      await writeFile(agentsPath, "## 测试\n必须运行 npm test\n");
      await initContextGraph(project.root);
      await indexContextGraph(project.root);
      const beforeWatch = await getContextStatus(project.root);

      const watcher = await startContextGraphWatcher(project.root, { debounceMs: 50, silent: true });
      try {
        const watching = await getContextStatus(project.root);
        expect(watching.watcher.status).toBe("watching");
        expect(watching.watcher.mode).toBe("local");
        expect(watching.watcher.message).toContain("Watching");

        await writeFile(agentsPath, "## 测试\n必须运行 npm test\n\n## Watcher 规则\n禁止删除 watcher 自动索引规则\n");

        await waitFor(async () => {
          const status = await getContextStatus(project.root);
          return status.status === "Fresh" && status.lastIndexedAt !== beforeWatch.lastIndexedAt;
        });

        const query = await queryContext(project.root, "watcher 自动索引规则");
        expect(query.results.some((result) => result.content.includes("禁止删除 watcher 自动索引规则"))).toBe(true);
      } finally {
        await watcher.close();
      }

      const stopped = await getContextStatus(project.root);
      expect(stopped.watcher.status).toBe("stopped");
    } finally {
      await project.cleanup();
    }
  });
});

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for watcher to reindex.");
}
