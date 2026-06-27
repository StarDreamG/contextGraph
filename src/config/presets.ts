import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectDetectionSnapshot, SourcePreset } from "../types/domain.js";

export const PRESET_NAMES = ["basic", "project", "api", "source-comments", "source"] as const satisfies readonly SourcePreset[];

export const PRESET_SOURCES: Record<SourcePreset, string[]> = {
  basic: [
    "**/AGENTS.md",
    "**/CLAUDE.md",
    "**/README.md",
    "docs/**/*.md",
    "**/docs/**/*.md",
    ".cursor/rules/**/*",
    "**/.cursor/rules/**/*",
    ".github/copilot-instructions.md",
    "**/.github/copilot-instructions.md",
    "**/tests/**/*.md",
    "**/test/**/*.md"
  ],
  project: [
    "**/AGENTS.md",
    "**/CLAUDE.md",
    "**/README.md",
    "docs/**/*.md",
    "**/docs/**/*.md",
    ".cursor/rules/**/*",
    "**/.cursor/rules/**/*",
    ".github/copilot-instructions.md",
    "**/.github/copilot-instructions.md",
    "**/bruno/**/*",
    "**/tests/**/*",
    "**/test/**/*",
    "**/playwright.config.*",
    "**/package.json",
    "**/pnpm-workspace.yaml",
    "**/pom.xml",
    "**/pyproject.toml",
    "**/requirements*.txt",
    "**/go.mod",
    "**/Cargo.toml",
    "**/Dockerfile",
    "**/docker-compose*.yml",
    "**/docker-compose*.yaml",
    "**/openapi.json",
    "**/openapi.yaml",
    "**/openapi.yml",
    "**/swagger.json",
    "**/swagger.yaml",
    "**/swagger.yml",
    "docs/**/openapi*.json",
    "docs/**/openapi*.yaml",
    "docs/**/openapi*.yml",
    "docs/**/swagger*.json",
    "docs/**/swagger*.yaml",
    "docs/**/swagger*.yml"
  ],
  api: [
    "**/openapi.json",
    "**/openapi.yaml",
    "**/openapi.yml",
    "**/swagger.json",
    "**/swagger.yaml",
    "**/swagger.yml",
    "docs/**/openapi*.json",
    "docs/**/openapi*.yaml",
    "docs/**/openapi*.yml",
    "docs/**/swagger*.json",
    "docs/**/swagger*.yaml",
    "docs/**/swagger*.yml"
  ],
  "source-comments": [],
  source: []
};

export function isSourcePreset(value: string): value is SourcePreset {
  return (PRESET_NAMES as readonly string[]).includes(value);
}

export function resolvePresetSources(presets: SourcePreset[]): string[] {
  return unique(presets.flatMap((preset) => PRESET_SOURCES[preset]));
}

export function mergePresetSources(sources: string[], presets: SourcePreset[]): string[] {
  return unique([...sources, ...resolvePresetSources(presets)]);
}

export async function detectProjectPresets(projectRoot: string): Promise<ProjectDetectionSnapshot> {
  const [hasPackageJson, hasPom, hasPyProject, hasRequirements, hasGoMod, hasCargo, hasOpenApi, hasDocker] =
    await Promise.all([
      exists(projectRoot, "package.json"),
      exists(projectRoot, "pom.xml"),
      exists(projectRoot, "pyproject.toml"),
      exists(projectRoot, "requirements.txt"),
      exists(projectRoot, "go.mod"),
      exists(projectRoot, "Cargo.toml"),
      hasAny(projectRoot, ["openapi.json", "openapi.yaml", "openapi.yml", "swagger.json", "swagger.yaml", "swagger.yml"]),
      hasAny(projectRoot, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"])
    ]);

  const languages = unique([
    ...(hasPackageJson ? ["javascript"] : []),
    ...(hasPom ? ["java"] : []),
    ...(hasPyProject || hasRequirements ? ["python"] : []),
    ...(hasGoMod ? ["go"] : []),
    ...(hasCargo ? ["rust"] : [])
  ]);
  const packageManagers = unique([
    ...(hasPackageJson ? [await detectNodePackageManager(projectRoot)] : []),
    ...(hasPom ? ["maven"] : []),
    ...(hasPyProject ? ["pyproject"] : []),
    ...(hasGoMod ? ["go"] : []),
    ...(hasCargo ? ["cargo"] : [])
  ]);
  const presets: SourcePreset[] = hasOpenApi ? ["project", "api"] : ["project"];

  return {
    presets,
    languages,
    frameworks: [],
    packageManagers,
    apiContracts: hasOpenApi ? ["openapi/swagger"] : [],
    deployment: hasDocker ? ["docker"] : [],
    generatedAt: new Date().toISOString()
  };
}

async function detectNodePackageManager(projectRoot: string): Promise<string> {
  if (await exists(projectRoot, "pnpm-lock.yaml")) return "pnpm";
  if (await exists(projectRoot, "yarn.lock")) return "yarn";
  if (await exists(projectRoot, "package-lock.json")) return "npm";
  return "npm";
}

async function hasAny(projectRoot: string, candidates: string[]): Promise<boolean> {
  const checks = await Promise.all(candidates.map((candidate) => exists(projectRoot, candidate)));
  return checks.some(Boolean);
}

async function exists(projectRoot: string, relativePath: string): Promise<boolean> {
  try {
    await access(path.join(projectRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function readPackageName(projectRoot: string): Promise<string | null> {
  const packagePath = path.join(projectRoot, "package.json");
  try {
    const parsed = JSON.parse(await readFile(packagePath, "utf8")) as { name?: unknown };
    return typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : null;
  } catch {
    return null;
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
