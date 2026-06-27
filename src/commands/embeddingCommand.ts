import type { Command } from "commander";
import { disableEmbedding, enableEmbedding, rebuildEmbeddings } from "../core/embeddingService.js";
import { getContextStatus } from "../core/statusService.js";
import type { EmbeddingProviderName } from "../types/domain.js";

const EMBEDDING_PROVIDERS: EmbeddingProviderName[] = [
  "none",
  "ollama",
  "local-onnx",
  "openai-compatible-local-endpoint"
];

export function registerEmbeddingCommand(program: Command): void {
  const embedding = program.command("embedding").description("Manage optional local embedding index");

  embedding
    .command("enable")
    .description("Enable optional embedding generation")
    .requiredOption("--provider <provider>", "Embedding provider: ollama, local-onnx, openai-compatible-local-endpoint")
    .requiredOption("--model <model>", "Embedding model name")
    .option("--endpoint <url>", "Local provider endpoint")
    .action(async (options: { provider: string; model: string; endpoint?: string }) => {
      const provider = parseProvider(options.provider);
      if (provider === "none") {
        throw new Error("Use contextgraph embedding disable to select provider none.");
      }
      const config = await enableEmbedding(process.cwd(), {
        provider,
        model: options.model,
        endpoint: options.endpoint
      });
      console.log("Embedding enabled.");
      console.log(`Provider: ${config.provider}`);
      console.log(`Model:    ${config.model}`);
      console.log(`Endpoint: ${config.endpoint ?? "default local endpoint"}`);
      console.log("Run contextgraph embedding rebuild to generate cached vectors.");
    });

  embedding
    .command("disable")
    .description("Disable embedding without deleting the base context index")
    .action(async () => {
      await disableEmbedding(process.cwd());
      console.log("Embedding disabled.");
    });

  embedding
    .command("status")
    .description("Show embedding freshness and cache status")
    .action(async () => {
      const status = await getContextStatus(process.cwd());
      console.log("ContextGraph Embedding Status");
      console.log("────────────────────────────────");
      console.log(`Status:          ${status.embeddingIndex.status}`);
      console.log(`Provider:        ${status.embeddingIndex.provider}`);
      console.log(`Model:           ${status.embeddingIndex.model ?? "none"}`);
      console.log(`Pending embeds:  ${status.embeddingIndex.pending}`);
      console.log(`Stale embeds:    ${status.embeddingIndex.stale}`);
      console.log(`Failed embeds:   ${status.embeddingIndex.failed}`);
      console.log(`Candidate edges: ${status.embeddingIndex.candidateEdges}`);
      console.log(`Confirmed edges: ${status.embeddingIndex.confirmedEdges}`);
      console.log(`Search mode:     ${status.searchMode}`);
    });

  embedding
    .command("rebuild")
    .description("Generate embeddings for new or changed blocks and discover candidate semantic edges")
    .option("--threshold <number>", "Semantic edge similarity threshold", parseNumber)
    .option("--max-edges <number>", "Maximum candidate edges per changed block", parseInteger)
    .action(async (options: { threshold?: number; maxEdges?: number }) => {
      const result = await rebuildEmbeddings(process.cwd(), {
        similarityThreshold: options.threshold,
        maxEdgesPerBlock: options.maxEdges
      });
      console.log("Embedding rebuild complete.");
      console.log(`Provider:          ${result.provider}`);
      console.log(`Model:             ${result.model}`);
      console.log(`Dimensions:        ${result.dimensions ?? "unknown"}`);
      console.log(`Embeddings created:${result.embeddingsCreated}`);
      console.log(`Embeddings skipped:${result.embeddingsSkipped}`);
      console.log(`Candidate edges:   ${result.candidateEdgesCreated}`);
    });
}

function parseProvider(value: string): Exclude<EmbeddingProviderName, "none"> | "none" {
  if (EMBEDDING_PROVIDERS.includes(value as EmbeddingProviderName)) {
    return value as Exclude<EmbeddingProviderName, "none"> | "none";
  }
  throw new Error(`Unknown embedding provider "${value}".`);
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}
