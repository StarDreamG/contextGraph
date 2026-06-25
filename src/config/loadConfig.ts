import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { ContextGraphConfig } from "../types/domain.js";

const LEGACY_DEFAULT_SOURCES = [
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
];

const LEGACY_DEFAULT_IGNORE = [
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
];

const configSchema = z.object({
  version: z.literal(1),
  projectName: z.string(),
  sources: z.array(z.string()).min(1),
  ignore: z.array(z.string()),
  privacy: z.object({
    offline: z.literal(true),
    allowRemoteLLM: z.literal(false),
    redactSecrets: z.literal(true)
  })
});

export async function loadConfig(projectRoot: string): Promise<ContextGraphConfig> {
  const configPath = path.join(projectRoot, ".contextgraph", "config.json");
  const raw = await readFile(configPath, "utf8");
  const config = configSchema.parse(JSON.parse(raw));
  return upgradeGeneratedLegacyDefaults(config);
}

function upgradeGeneratedLegacyDefaults(config: ContextGraphConfig): ContextGraphConfig {
  const usesLegacySources = arraysEqual(config.sources, LEGACY_DEFAULT_SOURCES);
  const usesLegacyIgnore = arraysEqual(config.ignore, LEGACY_DEFAULT_IGNORE);

  if (!usesLegacySources && !usesLegacyIgnore) {
    return config;
  }

  return {
    ...config,
    sources: usesLegacySources ? [...DEFAULT_CONFIG.sources] : config.sources,
    ignore: usesLegacyIgnore ? [...DEFAULT_CONFIG.ignore] : config.ignore
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
