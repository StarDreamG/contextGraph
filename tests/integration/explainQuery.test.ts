import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("explain-query command", () => {
  it("prints the query plan for a natural language query", async () => {
    const cli = path.resolve("dist/cli/main.js");

    const result = await execFileAsync("node", [
      cli,
      "explain-query",
      "智策星隔离要求，不能占用哪些端口和资源"
    ]);

    expect(result.stdout).toContain("Original Query:");
    expect(result.stdout).toContain("Normalized Query:");
    expect(result.stdout).toContain("Inferred Intents:");
    expect(result.stdout).toContain("Extracted Entities:");
    expect(result.stdout).toContain("Expanded Queries:");
    expect(result.stdout).toContain("智策星 隔离");
    expect(result.stdout).toContain("智策星 端口");
    expect(result.stdout).toContain("智策星 资源");
    expect(result.stdout).toContain("不能占用 端口");
  });
});
