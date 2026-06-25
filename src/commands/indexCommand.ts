import type { Command } from "commander";
import { indexContextGraph } from "../core/indexService.js";

export function registerIndexCommand(program: Command): void {
  program.command("index").description("Index configured project context sources").action(async () => {
    const result = await indexContextGraph(process.cwd());
    console.log("ContextGraph index complete.");
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
