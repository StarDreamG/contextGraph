import type { ParsedBlock } from "./types.js";

export function parseTextBlocks(filePath: string, content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split(/\r?\n/);
  let paragraph: string[] = [];
  let startLine: number | null = null;

  const flush = (endLine: number): void => {
    const text = paragraph.join("\n").trim();
    if (text.length > 0 && startLine !== null) {
      blocks.push({
        path: filePath,
        blockType: "text_paragraph",
        title: null,
        content: text,
        startLine,
        endLine
      });
    }
    paragraph = [];
    startLine = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      flush(index);
      continue;
    }
    startLine ??= index + 1;
    paragraph.push(line);
  }

  flush(lines.length);
  return blocks;
}
