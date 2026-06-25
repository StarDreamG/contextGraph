import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXTGRAPH_AGENT_SECTION, DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { loadConfig } from "../../src/config/loadConfig.js";
import { createTempProject } from "../helpers/project.js";

const legacyDefaultConfig = {
  version: 1,
  projectName: "",
  sources: [
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "docs/**/*.md",
    ".cursor/rules/**/*",
    "bruno/**/*",
    "tests/**/*",
    "playwright.config.*",
    "package.json",
    "pom.xml"
  ],
  ignore: [
    ".env",
    "*.pem",
    "*.key",
    "id_rsa",
    "node_modules/**",
    "target/**",
    "dist/**",
    "build/**",
    ".git/**",
    ".contextgraph/graph.db"
  ],
  privacy: {
    offline: true,
    allowRemoteLLM: false,
    redactSecrets: true
  }
} as const;

describe("default config", () => {
  it("is offline and redacts secrets", () => {
    expect(DEFAULT_CONFIG.privacy).toEqual({
      offline: true,
      allowRemoteLLM: false,
      redactSecrets: true
    });
    expect(DEFAULT_CONFIG.sources).toContain("**/AGENTS.md");
    expect(DEFAULT_CONFIG.sources).toContain("**/pom.xml");
    expect(DEFAULT_CONFIG.ignore).toContain(".env");
    expect(DEFAULT_CONFIG.ignore).toContain("**/.contextgraph/**");
  });

  it("contains agent instructions for status, index, query, and handoff", () => {
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph status");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph index");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph query");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph handoff");
  });

  it("upgrades generated legacy defaults to recursive project indexing", async () => {
    const project = await createTempProject();
    try {
      await mkdir(path.join(project.root, ".contextgraph"), { recursive: true });
      await writeFile(
        path.join(project.root, ".contextgraph", "config.json"),
        JSON.stringify(legacyDefaultConfig, null, 2)
      );

      const config = await loadConfig(project.root);

      expect(config.sources).toContain("**/pom.xml");
      expect(config.ignore).toContain("**/logs/**");
    } finally {
      await project.cleanup();
    }
  });

  it("preserves user-customized source lists", async () => {
    const project = await createTempProject();
    try {
      await mkdir(path.join(project.root, ".contextgraph"), { recursive: true });
      await writeFile(
        path.join(project.root, ".contextgraph", "config.json"),
        JSON.stringify({ ...legacyDefaultConfig, sources: ["custom/**/*.md"] }, null, 2)
      );

      const config = await loadConfig(project.root);

      expect(config.sources).toEqual(["custom/**/*.md"]);
    } finally {
      await project.cleanup();
    }
  });
});
