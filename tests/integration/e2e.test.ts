import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createTempProject } from "../helpers/project.js";

const execFileAsync = promisify(execFile);

describe("CLI e2e", () => {
  it("exposes publishable package metadata and a portable binary wrapper", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as {
      name?: string;
      version?: string;
      private?: boolean;
      bin?: Record<string, string>;
      files?: string[];
      license?: string;
      main?: string;
      exports?: Record<string, string>;
      scripts?: Record<string, string>;
      publishConfig?: Record<string, string>;
    };
    const wrapper = await readFile(path.resolve("bin/contextgraph"), "utf8");
    const oldLocalNodePath = [
      "/Users",
      "apple",
      ".nvm",
      "versions",
      "node",
      "v24.14.1",
      "bin",
      "node"
    ].join("/");

    expect(packageJson.name).toBe("@stardreamg/contextgraph");
    expect(packageJson.version).toBe("0.1.1");
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.license).toBe("Apache-2.0");
    expect(packageJson.main).toBe("dist/cli/main.js");
    expect(packageJson.exports?.["."]).toBe("./dist/cli/main.js");
    expect(packageJson.bin?.contextgraph).toBe("bin/contextgraph");
    expect(wrapper).toContain("#!/usr/bin/env bash");
    expect(wrapper).not.toContain(oldLocalNodePath);
    expect(wrapper).toContain("dist/cli/main.js");
    expect(wrapper).toContain('NODE_BIN="$INVOKED_DIR/node"');
    expect(packageJson.files).toEqual(["bin", "dist", "README.md", "LICENSE"]);
    expect(packageJson.scripts?.prepack).toBe("npm run build");
    expect(packageJson.publishConfig?.access).toBe("public");
  });

  it("prints the package version with --version and -V", async () => {
    const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8")) as { version?: string };
    const cli = path.resolve("dist/cli/main.js");

    const longVersion = await execFileAsync("node", [cli, "--version"]);
    const shortVersion = await execFileAsync("node", [cli, "-V"]);

    expect(longVersion.stdout.trim()).toBe(packageJson.version);
    expect(shortVersion.stdout.trim()).toBe(packageJson.version);
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

      const doctor = await execFileAsync("node", [cli, "doctor", "--project", project.root], { cwd: project.root });
      expect(doctor.stdout).toContain("ContextGraph Doctor");
      expect(doctor.stdout).toContain("Project initialized: yes");
      expect(doctor.stdout).toContain("Index status:        Fresh");

      const mcpHelp = await execFileAsync("node", [cli, "mcp", "--help"], { cwd: project.root });
      expect(mcpHelp.stdout).toContain("--project <path>");

      const watchHelp = await execFileAsync("node", [cli, "watch", "--help"], { cwd: project.root });
      expect(watchHelp.stdout).toContain("--debounce <ms>");

      const query = await execFileAsync("node", [cli, "query", "测试"], { cwd: project.root });
      expect(query.stdout).toContain("Relevant Context:");

      const brief = await execFileAsync("node", [cli, "brief"], { cwd: project.root });
      expect(brief.stdout).toContain("ContextGraph Brief");
      expect(brief.stdout).toContain("P0 Rules");
      expect(brief.stdout).toContain("Required Tests");
      expect(brief.stdout).toContain("Tool Profile");

      const taskBrief = await execFileAsync("node", [cli, "brief", "--task", "测试", "--file", "AGENTS.md"], {
        cwd: project.root
      });
      expect(taskBrief.stdout).toContain("Task:       测试");
      expect(taskBrief.stdout).toContain("File:       AGENTS.md");

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
