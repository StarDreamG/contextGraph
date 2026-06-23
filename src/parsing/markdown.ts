import type { ParsedBlock } from "./types.js";

interface Section {
  title: string | null;
  startIndex: number;
  endIndex: number;
}

const headingPattern = /^(#{1,6})\s+(.+?)\s*#*$/;

export function parseMarkdownBlocks(filePath: string, content: string): ParsedBlock[] {
  const lines = content.split(/\r?\n/);
  const startIndex = frontmatterEndIndex(lines);
  const sections: Section[] = [];
  let current: Section | null = null;

  for (let index = startIndex; index < lines.length; index += 1) {
    const heading = lines[index]?.match(headingPattern);
    if (!heading) {
      continue;
    }
    if (current) {
      current.endIndex = trimTrailingBlankLines(lines, index - 1);
      sections.push(current);
    }
    current = {
      title: heading[2]?.trim() || null,
      startIndex: index,
      endIndex: index
    };
  }

  if (current) {
    current.endIndex = trimTrailingBlankLines(lines, lines.length - 1);
    sections.push(current);
  }

  if (sections.length === 0) {
    const endIndex = trimTrailingBlankLines(lines, lines.length - 1);
    const text = lines.slice(startIndex, endIndex + 1).join("\n").trim();
    return text.length === 0
      ? []
      : [
          {
            path: filePath,
            blockType: "markdown_section",
            title: null,
            content: text,
            startLine: startIndex + 1,
            endLine: endIndex + 1
          }
        ];
  }

  return sections.map((section) => {
    const raw = lines.slice(section.startIndex + 1, section.endIndex + 1).join("\n").trim();
    return {
      path: filePath,
      blockType: "markdown_section",
      title: section.title,
      content: raw,
      startLine: section.startIndex + 1,
      endLine: section.endIndex + 1
    };
  });
}

function frontmatterEndIndex(lines: string[]): number {
  if (lines[0]?.trim() !== "---") {
    return 0;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") {
      return index + 1;
    }
  }

  return 0;
}

function trimTrailingBlankLines(lines: string[], index: number): number {
  let cursor = index;
  while (cursor >= 0 && lines[cursor]?.trim() === "") {
    cursor -= 1;
  }
  return Math.max(cursor, 0);
}
