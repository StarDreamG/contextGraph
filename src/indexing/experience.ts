export interface ExperienceFacts {
  files: string[];
  testCommands: string[];
  modules: string[];
}

const filePathPattern = /\b(?:[\w.-]+\/)+[\w./-]+\.[A-Za-z0-9]+\b/g;
const testCommandPattern = /\b(?:npm|pnpm|yarn|npx|mvn|node|go|cargo|pytest)\s+[^\n。；;]+/gi;
const modulePattern = /([\p{L}\p{N}_-]+)\s*模块/gu;

export function extractExperienceFacts(content: string): ExperienceFacts {
  return {
    files: unique(matches(content, filePathPattern)),
    testCommands: unique(matches(content, testCommandPattern).map((command) => command.trim())),
    modules: unique([...content.matchAll(modulePattern)].map((match) => match[1]).filter(isString))
  };
}

function matches(input: string, pattern: RegExp): string[] {
  return [...input.matchAll(pattern)].map((match) => match[0]).filter(isString);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
