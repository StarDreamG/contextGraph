import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTEXTGRAPH_AGENT_SECTION, DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { loadConfig } from "../../src/config/loadConfig.js";
import { detectProjectPresets, resolvePresetSources } from "../../src/config/presets.js";
import { initContextGraph } from "../../src/core/initService.js";
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
    expect(DEFAULT_CONFIG.ignore).toContain("**/.local/**");
    expect(DEFAULT_CONFIG.ignore).toContain("**/*.pyc");
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

  it("resolves project and api presets without turning ContextGraph into a source graph", () => {
    const projectSources = resolvePresetSources(["project"]);
    const apiSources = resolvePresetSources(["api"]);

    expect(projectSources).toContain("**/package.json");
    expect(projectSources).toContain("**/Dockerfile");
    expect(projectSources).toContain("**/docker-compose*.yml");
    expect(projectSources).toContain("**/openapi.yaml");
    expect(apiSources).toContain("docs/**/openapi*.json");
    expect(projectSources).not.toContain("**/*.ts");
    expect(projectSources).not.toContain("**/*.js");
  });

  it("detects project presets from local files during init", async () => {
    const project = await createTempProject();
    try {
      await writeFile(path.join(project.root, "package.json"), JSON.stringify({ scripts: { test: "vitest" } }));
      await writeFile(path.join(project.root, "openapi.yaml"), "openapi: 3.0.0\ninfo:\n  title: Demo\n");

      const detected = await detectProjectPresets(project.root);
      expect(detected.presets).toEqual(expect.arrayContaining(["project", "api"]));
      expect(detected.languages).toContain("javascript");

      await initContextGraph(project.root);
      const config = await loadConfig(project.root);

      expect(config.presets).toEqual(expect.arrayContaining(["project", "api"]));
      expect(config.detectedProject?.languages).toContain("javascript");
      expect(config.sources).toContain("**/openapi.yaml");
      expect(config.sources).not.toContain("**/*.ts");
    } finally {
      await project.cleanup();
    }
  });
});
