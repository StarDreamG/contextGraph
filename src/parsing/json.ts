import type { ParsedBlock } from "./types.js";

export function parseJsonBlocks(filePath: string, content: string): ParsedBlock[] {
  const parsed = JSON.parse(content) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [
      {
        path: filePath,
        blockType: "json_value",
        title: null,
        content: JSON.stringify(parsed, null, 2),
        startLine: 1,
        endLine: content.split(/\r?\n/).length
      }
    ];
  }

  return Object.entries(parsed).map(([key, value]) => ({
    path: filePath,
    blockType: "json_key",
    title: key,
    content: JSON.stringify(value, null, 2),
    startLine: null,
    endLine: null
  }));
}
