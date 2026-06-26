import type { Command } from "commander";
import { buildQueryPlan } from "../query/queryPlanner.js";

export function registerExplainQueryCommand(program: Command): void {
  program
    .command("explain-query")
    .description("Explain how ContextGraph plans a natural language query")
    .argument("<query>", "Natural language query to explain")
    .action((query: string) => {
      const plan = buildQueryPlan(query);
      console.log("Original Query:");
      console.log(plan.originalQuery);
      console.log("");
      console.log("Normalized Query:");
      console.log(plan.normalizedQuery);
      console.log("");
      console.log("Inferred Intents:");
      printList(plan.intents);
      console.log("");
      console.log("Expected Types:");
      printList(plan.expectedTypes);
      console.log("");
      console.log("Extracted Entities:");
      console.log(`- terms: ${formatValues(plan.entities.terms)}`);
      console.log(`- numbers: ${formatValues(plan.entities.numbers)}`);
      console.log(`- ports: ${formatValues(plan.entities.ports)}`);
      console.log(`- ips: ${formatValues(plan.entities.ips)}`);
      console.log(`- files: ${formatValues(plan.entities.files)}`);
      console.log(`- configKeys: ${formatValues(plan.entities.configKeys)}`);
      console.log("");
      console.log("Expanded Queries:");
      plan.expandedQueries.forEach((expandedQuery, index) => {
        console.log(`${index + 1}. ${expandedQuery}`);
      });
      console.log("");
      console.log("Retriever Plan:");
      console.log("- fts");
      console.log("- trigram");
    });
}

function printList(values: string[]): void {
  if (values.length === 0) {
    console.log("- none");
    return;
  }
  for (const value of values) {
    console.log(`- ${value}`);
  }
}

function formatValues(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}
