import type { Command } from "commander";
import { startMcpServer } from "../mcp/server.js";

export function registerMcpCommand(program: Command): void {
  program.command("mcp").description("Start the ContextGraph MCP stdio server").action(async () => {
    try {
      await startMcpServer(process.cwd());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ContextGraph MCP server failed: ${message}`);
      process.exitCode = 1;
    }
  });
}
