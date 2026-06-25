import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTempProject } from "../helpers/project.js";

const execFileAsync = promisify(execFile);

describe("CLI e2e", () => {
  it("exposes a stable development wrapper as the package binary", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as {
      bin?: Record<string, string>;
    };
    const wrapper = await readFile(path.resolve("bin/contextgraph"), "utf8");

    expect(packageJson.bin?.contextgraph).toBe("./bin/contextgraph");
    expect(wrapper).toContain("/Users/apple/.nvm/versions/node/v24.14.1/bin/node");
    expect(wrapper).toContain("dist/cli/main.js");
  });

  it("runs init, index, status, query, and handoff from the built CLI", async () => {
    const project = await createTempProject();
    try {
      const cli = path.resolve("dist/cli/main.js");
      await execFileAsync("node", [cli, "init"], { cwd: project.root });
      await writeFile(path.join(project.root, "AGENTS.md"), "## 测试\n必须运行 npm test\n");

      const index = await execFileAsync("node", [cli, "index"], { cwd: project.root });
      expect(index.stdout).toContain("ContextGraph index complete.");

      const status = await execFileAsync("node", [cli, "status"], { cwd: project.root });
      expect(status.stdout).toContain("Status:");

      const query = await execFileAsync("node", [cli, "query", "测试"], { cwd: project.root });
      expect(query.stdout).toContain("Relevant Context:");

      const handoff = await execFileAsync(
        "node",
        [
          cli,
          "handoff",
          "--agent",
          "codex",
          "--task",
          "测试",
          "--summary",
          "fix failed test",
          "--files",
          "AGENTS.md"
        ],
        { cwd: project.root }
      );
      expect(handoff.stdout).toContain("Handoff recorded.");
    } finally {
      await project.cleanup();
    }
  });
});
