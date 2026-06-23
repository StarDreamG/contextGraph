import { describe, expect, it } from "vitest";
import { parseJsonBlocks } from "../../src/parsing/json.js";
import { parseMarkdownBlocks } from "../../src/parsing/markdown.js";
import { parseTextBlocks } from "../../src/parsing/text.js";

describe("parsers", () => {
  it("splits markdown by headings and keeps line ranges", () => {
    const blocks = parseMarkdownBlocks(
      "docs/rules.md",
      "# Root\nintro\n\n## 后端规范\n必须运行 npm test\n\n## 测试\nnpx playwright test\n"
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toMatchObject({
      blockType: "markdown_section",
      title: "后端规范",
      startLine: 4,
      endLine: 5
    });
  });

  it("splits json by top-level keys", () => {
    const blocks = parseJsonBlocks("package.json", "{\"scripts\":{\"test\":\"vitest\"},\"name\":\"demo\"}");

    expect(blocks.map((block) => block.title)).toEqual(["scripts", "name"]);
  });

  it("splits plain text by paragraphs", () => {
    const blocks = parseTextBlocks("notes.txt", "first paragraph\n\nsecond paragraph");

    expect(blocks).toHaveLength(2);
  });
});
