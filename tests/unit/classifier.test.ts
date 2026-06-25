import { describe, expect, it } from "vitest";
import { classifyBlock } from "../../src/indexing/classifier.js";

describe("classifier", () => {
  it("extracts command, test, rule, failure, and fix nodes", () => {
    expect(
      classifyBlock({ title: "命令", content: "npm test", sourceId: "s", blockId: "b" }).map((node) => node.type)
    ).toContain("Command");
    expect(
      classifyBlock({ title: "测试", content: "Playwright export.spec.ts", sourceId: "s", blockId: "b" }).map(
        (node) => node.type
      )
    ).toContain("Test");
    expect(
      classifyBlock({ title: "规范", content: "必须保持字段顺序", sourceId: "s", blockId: "b" }).map(
        (node) => node.type
      )
    ).toContain("Rule");
    expect(
      classifyBlock({ title: "失败", content: "failed because timeout", sourceId: "s", blockId: "b" }).map(
        (node) => node.type
      )
    ).toContain("Failure");
    expect(
      classifyBlock({ title: "修复", content: "fix resolved retry issue", sourceId: "s", blockId: "b" }).map(
        (node) => node.type
      )
    ).toContain("Fix");
  });
});
