import type { Command } from "commander";
import { isSourcePreset } from "../config/presets.js";
import { indexContextGraph } from "../core/indexService.js";
import type { SourcePreset } from "../types/domain.js";

export function registerIndexCommand(program: Command): void {
  program
    .command("index")
    .description("Index configured project context sources")
    .option("--preset <preset>", "Temporarily include preset sources: basic, project, api, source-comments, source")
    .action(async (options: { preset?: string }) => {
      const preset = parsePreset(options.preset);
      const result = await indexContextGraph(process.cwd(), { preset });
      console.log("ContextGraph index complete.");
      console.log(`Presets: ${result.presetsUsed.length === 0 ? "none" : result.presetsUsed.join(", ")}`);
      console.log(`Sources scanned: ${result.sourcesScanned}`);
      console.log(`Sources changed: ${result.sourcesChanged}`);
      console.log(`Blocks indexed: ${result.blocksIndexed}`);
      console.log(`Nodes created: ${result.nodesCreated}`);
      console.log(`Nodes updated: ${result.nodesUpdated}`);
      console.log(`Edges created: ${result.edgesCreated}`);
      console.log(`Current HEAD: ${result.currentHead ?? "none"}`);
      console.log(`Indexed HEAD: ${result.indexedHead ?? "none"}`);
      console.log(`Last indexed: ${result.lastIndexedAt}`);
      console.log(`Status: ${result.status}`);
    });
}

function parsePreset(value: string | undefined): SourcePreset | undefined {
  if (!value) {
    return undefined;
  }
  if (isSourcePreset(value)) {
    return value;
  }
  throw new Error(`Unknown preset "${value}".`);
}
