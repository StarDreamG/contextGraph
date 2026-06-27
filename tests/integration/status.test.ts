import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { getContextStatus } from "../../src/core/statusService.js";
import { createTempProject } from "../helpers/project.js";

const execFileAsync = promisify(execFile);

describe("status", () => {
  it("detects fresh state and unindexed source edits", async () => {
    const project = await createTempProject();
    try {
      const agentsPath = path.join(project.root, "AGENTS.md");
      await writeFile(agentsPath, "## 测试\n必须运行 npm test\n");
      await execFileAsync("git", ["add", "AGENTS.md"], { cwd: project.root });
      await execFileAsync("git", ["commit", "-m", "docs: add agents"], { cwd: project.root });

      await initContextGraph(project.root);
      await indexContextGraph(project.root);

      const initialFresh = await getContextStatus(project.root);
      expect(initialFresh.status).toBe("Fresh");
      expect(initialFresh.contextIndex.status).toBe("Fresh");
      expect(initialFresh.embeddingIndex.status).toBe("disabled");
      expect(initialFresh.embeddingIndex.candidateEdges).toBe(0);
      expect(initialFresh.embeddingIndex.confirmedEdges).toBe(0);
      expect(initialFresh.embeddingIndex.pendingSemanticEdgeBlocks).toBe(0);
      expect(initialFresh.extractorIndex.status).toBe("disabled");
      expect(initialFresh.overallReliability).toBe("High");

      await writeFile(agentsPath, "## 测试\n必须运行 npm test\n\n新增规则\n");
      const stale = await getContextStatus(project.root);

      expect(stale.status).toBe("Stale");
      expect(stale.contextIndex.status).toBe("Stale");
      expect(stale.reliability).toBe("Low");
      expect(stale.overallReliability).toBe("Low");
      expect(stale.changedFiles).toBeGreaterThan(0);

      await indexContextGraph(project.root);
      const freshAgain = await getContextStatus(project.root);
      expect(freshAgain.status).toBe("Fresh");
      expect(freshAgain.contextIndex.status).toBe("Fresh");
      expect(freshAgain.changedFiles).toBe(0);
    } finally {
      await project.cleanup();
    }
  });
});
