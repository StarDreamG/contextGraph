import type { ContextGraphConfig } from "../types/domain.js";
import { resolvePresetSources } from "./presets.js";

export const DEFAULT_CONFIG: ContextGraphConfig = {
  version: 1,
  projectName: "",
  presets: ["project"],
  sources: resolvePresetSources(["project"]),
  ignore: [
    ".env",
    "**/.env",
    "**/.env.*",
    "*.pem",
    "**/*.pem",
    "*.key",
    "**/*.key",
    "id_rsa",
    "**/id_rsa",
    "node_modules/**",
    "**/node_modules/**",
    "target/**",
    "**/target/**",
    "dist/**",
    "**/dist/**",
    "build/**",
    "**/build/**",
    "coverage/**",
    "**/coverage/**",
    ".local/**",
    "**/.local/**",
    "logs/**",
    "**/logs/**",
    "*.log",
    "**/*.log",
    "*.gz",
    "**/*.gz",
    "*.pyc",
    "**/*.pyc",
    "*.pyo",
    "**/*.pyo",
    "*.class",
    "**/*.class",
    "*.jar",
    "**/*.jar",
    ".git/**",
    "**/.git/**",
    ".contextgraph/**",
    "**/.contextgraph/**"
  ],
  privacy: {
    offline: true,
    allowRemoteLLM: false,
    redactSecrets: true
  }
};

export const CONTEXTGRAPH_AGENT_SECTION_START = "<!-- contextgraph:start -->";
export const CONTEXTGRAPH_AGENT_SECTION_END = "<!-- contextgraph:end -->";

export const CONTEXTGRAPH_AGENT_SECTION = `${CONTEXTGRAPH_AGENT_SECTION_START}

# Agent Instructions

This project uses ContextGraph.
Before starting any task:
1. Run \`contextgraph status\`.
2. If status is stale, run \`contextgraph index\`.
3. Query relevant project context with \`contextgraph query "<task>"\`.
4. After finishing, record a handoff summary with \`contextgraph handoff\`.

Do not rely only on this file. The source of truth for project context is \`.contextgraph/graph.db\`.

${CONTEXTGRAPH_AGENT_SECTION_END}`;
