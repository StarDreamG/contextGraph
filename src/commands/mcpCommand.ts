import path from "node:path";
import type { Command } from "commander";
import { startMcpServer } from "../mcp/server.js";

interface McpOptions {
  project?: string;
}

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Start the ContextGraph MCP stdio server")
    .option("-p, --project <path>", "Project root to serve", process.cwd())
    .action(async (options: McpOptions) => {
      try {
        await startMcpServer(path.resolve(options.project ?? process.cwd()));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ContextGraph MCP server failed: ${message}`);
        process.exitCode = 1;
      }
    });
}
