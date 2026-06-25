import type { Command } from "commander";
import { queryContext } from "../core/queryService.js";

export function registerQueryCommand(program: Command): void {
  program
    .command("query")
    .description("Search relevant project context")
    .argument("<query>", "Natural language task or context query")
    .action(async (query: string) => {
      const response = await queryContext(process.cwd(), query);
      console.log("ContextGraph Query");
      console.log("────────────────────────────────");
      console.log(`Query: ${response.query}`);
      console.log(`Status: ${response.status.status}`);
      console.log(`Reliability: ${response.status.reliability}`);
      for (const warning of response.warnings) {
        console.log(`Warning: ${warning}`);
      }
      console.log("Relevant Context:");
      if (response.results.length === 0) {
        console.log("No relevant context found.");
        return;
      }
      for (const result of response.results) {
        const source = result.sourcePath
          ? `${result.sourcePath}:${result.startLine ?? "?"}-${result.endLine ?? "?"}`
          : "unknown";
        console.log(`[${result.type}] ${result.title}`);
        console.log(`Priority: ${result.priority} (${result.priorityReason})`);
        console.log(`Source: ${source}`);
        console.log(`Confidence: ${result.confidence}`);
        console.log(`Status: ${result.status}`);
        console.log("Content:");
        console.log(result.content);
        console.log("");
      }
    });
}
