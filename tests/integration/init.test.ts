import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initContextGraph } from "../../src/core/initService.js";
import { createTempProject } from "../helpers/project.js";

describe("init", () => {
  it("creates ContextGraph files and idempotent AGENTS instructions", async () => {
    const project = await createTempProject();
    try {
      await initContextGraph(project.root);
      await initContextGraph(project.root);

      await stat(path.join(project.root, ".contextgraph", "graph.db"));
      await stat(path.join(project.root, ".contextgraph", "config.json"));
      await stat(path.join(project.root, ".contextgraph", "status.json"));
      await stat(path.join(project.root, ".contextgraph", "sessions"));

      const agents = await readFile(path.join(project.root, "AGENTS.md"), "utf8");
      expect(agents.match(/contextgraph:start/g)?.length).toBe(1);
      expect(agents).toContain("contextgraph status");
    } finally {
      await project.cleanup();
    }
  });
});
