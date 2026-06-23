import { describe, expect, it } from "vitest";
import { CONTEXTGRAPH_AGENT_SECTION, DEFAULT_CONFIG } from "../../src/config/defaults.js";

describe("default config", () => {
  it("is offline and redacts secrets", () => {
    expect(DEFAULT_CONFIG.privacy).toEqual({
      offline: true,
      allowRemoteLLM: false,
      redactSecrets: true
    });
    expect(DEFAULT_CONFIG.sources).toContain("AGENTS.md");
    expect(DEFAULT_CONFIG.ignore).toContain(".env");
    expect(DEFAULT_CONFIG.ignore).toContain(".contextgraph/graph.db");
  });

  it("contains agent instructions for status, index, query, and handoff", () => {
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph status");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph index");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph query");
    expect(CONTEXTGRAPH_AGENT_SECTION).toContain("contextgraph handoff");
  });
});
