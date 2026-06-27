import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enableEmbedding, rebuildEmbeddings } from "../../src/core/embeddingService.js";
import { indexContextGraph } from "../../src/core/indexService.js";
import { initContextGraph } from "../../src/core/initService.js";
import { queryContext } from "../../src/core/queryService.js";
import { getContextStatus } from "../../src/core/statusService.js";
import { openDatabase } from "../../src/storage/database.js";
import { createTempProject } from "../helpers/project.js";

describe("embedding", () => {
  it("enables optional local embeddings, caches by block hash, and creates candidate semantic edges", async () => {
    const project = await createTempProject();
    const server = await startEmbeddingServer();
    try {
      await writeFile(
        path.join(project.root, "AGENTS.md"),
        [
          "## 区块链上传规则",
          "修改区块链附件上传必须保留链上回执，并运行 npm test -- blockchain-upload。",
          "",
          "## 区块链失败经验",
          "历史失败：blockchain upload failed because txid 丢失，修复方案是保留回执映射。",
          "",
          "## 导出规则",
          "修改报表导出必须运行 npm test -- export。"
        ].join("\n")
      );

      await initContextGraph(project.root);
      await indexContextGraph(project.root);
      expect((await getContextStatus(project.root)).embeddingIndex.status).toBe("disabled");

      await enableEmbedding(project.root, {
        provider: "openai-compatible-local-endpoint",
        model: "local-test",
        endpoint: server.url
      });

      const stale = await getContextStatus(project.root);
      expect(stale.embeddingIndex.status).toBe("stale");
      expect(stale.embeddingIndex.pending).toBeGreaterThan(0);

      const rebuilt = await rebuildEmbeddings(project.root, { similarityThreshold: 0.1 });
      expect(rebuilt.embeddingsCreated).toBeGreaterThan(0);
      expect(rebuilt.embeddingsSkipped).toBe(0);
      expect(rebuilt.candidateEdgesCreated).toBeGreaterThan(0);

      const fresh = await getContextStatus(project.root);
      expect(fresh.embeddingIndex).toMatchObject({
        status: "enabled",
        provider: "openai-compatible-local-endpoint",
        model: "local-test",
        pending: 0,
        stale: 0
      });
      expect(fresh.embeddingIndex.candidateEdges).toBeGreaterThan(0);
      expect(fresh.searchMode).toBe("hybrid");

      const second = await rebuildEmbeddings(project.root, { similarityThreshold: 0.1 });
      expect(second.embeddingsCreated).toBe(0);
      expect(second.embeddingsSkipped).toBeGreaterThan(0);

      const query = await queryContext(project.root, "txid");
      expect(query.results.some((item) => item.matchedQuery === "graph-expansion")).toBe(true);

      const db = openDatabase(path.join(project.root, ".contextgraph", "graph.db"));
      try {
        const embeddingCount = db.prepare("SELECT COUNT(*) AS count FROM embeddings").get() as { count: number };
        const blockCount = db.prepare("SELECT COUNT(*) AS count FROM blocks").get() as { count: number };
        expect(embeddingCount.count).toBe(blockCount.count);

        const semanticEdges = db
          .prepare("SELECT relation, metadata FROM edges WHERE relation = 'SEMANTICALLY_RELATED'")
          .all() as Array<{ relation: string; metadata: string }>;
        expect(semanticEdges.length).toBeGreaterThan(0);
        expect(semanticEdges.every((edge) => JSON.parse(edge.metadata).status === "candidate")).toBe(true);
      } finally {
        db.close();
      }
    } finally {
      await server.close();
      await project.cleanup();
    }
  });
});

async function startEmbeddingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const body = JSON.parse(await readBody(request)) as { input?: string | string[] };
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        data: inputs.map((input, index) => ({
          index,
          embedding: vectorFor(input)
        }))
      })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test embedding server.");
  }
  return {
    url: `http://127.0.0.1:${address.port}/v1/embeddings`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function vectorFor(input: string): number[] {
  const text = input.toLowerCase();
  return [
    /区块链|blockchain/.test(text) ? 1 : 0,
    /上传|upload|txid/.test(text) ? 1 : 0,
    /导出|export/.test(text) ? 1 : 0,
    0.1
  ];
}
