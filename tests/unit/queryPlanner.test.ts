import { describe, expect, it } from "vitest";
import { buildQueryPlan, extractEntities, inferIntent, normalizeQuery } from "../../src/query/queryPlanner.js";

describe("query planner", () => {
  it("normalizes Chinese natural language while preserving technical tokens", () => {
    const query = "智策星隔离要求，不能占用 61192、127.0.0.1、zshh.blockApiPostUrl、/api/v1/cross-chain/send";

    expect(normalizeQuery(query)).toContain("智策星隔离要求");
    expect(normalizeQuery(query)).toContain("61192");
    expect(normalizeQuery(query)).toContain("127.0.0.1");
    expect(normalizeQuery(query)).toContain("zshh.blockApiPostUrl");
    expect(normalizeQuery(query)).toContain("/api/v1/cross-chain/send");
  });

  it("extracts entities and intent from environment constraint queries", () => {
    const query = "智策星隔离要求，不能占用哪些端口和资源";

    expect(extractEntities(query)).toMatchObject({
      terms: expect.arrayContaining(["智策星", "隔离", "不能占用", "端口", "资源"])
    });
    expect(inferIntent(query)).toMatchObject({
      intents: expect.arrayContaining(["environment_constraint", "port_constraint", "rule_lookup"]),
      expectedTypes: expect.arrayContaining(["Rule", "EnvironmentFact", "Risk", "PortConstraint"])
    });
  });

  it("builds expanded queries for Chinese natural language tasks", () => {
    const plan = buildQueryPlan("智策星隔离要求，不能占用哪些端口和资源");

    expect(plan.expandedQueries).toEqual(
      expect.arrayContaining(["智策星 隔离", "智策星 端口", "智策星 资源", "不能占用 端口"])
    );
  });
});
