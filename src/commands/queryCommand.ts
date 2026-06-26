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
        console.log("");
        console.log("Query plan:");
        console.log(`- normalized query: ${response.queryPlan.normalizedQuery}`);
        console.log(`- inferred intent: ${formatList(response.queryPlan.intents)}`);
        console.log(`- expected types: ${formatList(response.queryPlan.expectedTypes)}`);
        console.log(`- extracted terms: ${formatList(response.queryPlan.entities.terms)}`);
        console.log("- expanded queries attempted:");
        for (const expandedQuery of response.queryPlan.expandedQueries) {
          console.log(`  - ${expandedQuery}`);
        }
        console.log("");
        console.log("Suggestions:");
        for (const suggestion of response.suggestions) {
          console.log(`- ${suggestion}`);
        }
        return;
      }
      for (const result of response.results) {
        const source = result.sourcePath
          ? `${result.sourcePath}:${result.startLine ?? "?"}-${result.endLine ?? "?"}`
          : "unknown";
        console.log(`[${result.type}] ${result.title}`);
        console.log(`Priority: ${result.priority} (${result.priorityReason})`);
        console.log(`Source: ${source}`);
        if (result.matchedByExpandedQuery && result.matchedQuery) {
          console.log(`Matched by expanded query: ${result.matchedQuery}`);
        } else if (result.matchedQuery) {
          console.log(`Matched query: ${result.matchedQuery}`);
        }
        console.log(`Confidence: ${result.confidence}`);
        console.log(`Status: ${result.status}`);
        console.log("Content:");
        console.log(result.content);
        console.log("");
      }
    });
}

function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}
