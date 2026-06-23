import type { Command } from "commander";
import { getContextStatus } from "../core/statusService.js";

export function registerStatusCommand(program: Command): void {
  program.command("status").description("Show ContextGraph freshness and reliability").action(async () => {
    const status = await getContextStatus(process.cwd());
    console.log("ContextGraph Status");
    console.log("────────────────────────────────");
    console.log(`Project:        ${process.cwd()}`);
    console.log(`Status:         ${status.status}`);
    console.log(`Reliability:    ${status.reliability}`);
    console.log(`Last indexed:   ${status.lastIndexedAt ?? "never"}`);
    console.log(`Current HEAD:   ${status.currentGitHead ?? "none"}`);
    console.log(`Indexed HEAD:   ${status.indexedGitHead ?? "none"}`);
    console.log(`Sources:        ${status.sourceCount}`);
    console.log(`Blocks:         ${status.blockCount}`);
    console.log(`Nodes:          ${status.nodeCount}`);
    console.log(`Edges:          ${status.edgeCount}`);
    console.log(`Changed files:  ${status.changedFiles}`);
    console.log(`Pending blocks: ${status.pendingBlocks}`);
    console.log(`Failed blocks:  ${status.failedBlocks}`);
    console.log(`Conflicts:      ${status.conflicts}`);
    console.log("MCP server:     stopped");
    console.log("Watcher:        stopped");
    if (status.warnings.length > 0) {
      console.log("Warning:");
      for (const warning of status.warnings) {
        console.log(warning);
      }
    }
  });
}
