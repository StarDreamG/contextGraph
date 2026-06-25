import { describe, expect, it } from "vitest";
import { createMcpServer } from "../../src/mcp/server.js";

describe("mcp server", () => {
  it("creates a server exposing required tools", () => {
    const server = createMcpServer({ projectRoot: process.cwd() });

    expect(server).toBeDefined();
  });
});
