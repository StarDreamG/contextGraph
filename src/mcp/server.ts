import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { queryContext } from "../core/queryService.js";
import { getContextStatus } from "../core/statusService.js";

export interface McpServerOptions {
  projectRoot: string;
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer({
    name: "contextgraph",
    version: "0.1.0"
  });

  server.registerTool(
    "get_context_status",
    {
      description: "Return ContextGraph freshness, reliability, timestamps, Git heads, and counts."
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await getContextStatus(options.projectRoot), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "get_relevant_context",
    {
      description: "Return relevant project context for a task.",
      inputSchema: {
        task: z.string(),
        files: z.array(z.string()).optional()
      }
    },
    async ({ task, files }) => {
      const query = [task, ...(files ?? [])].join(" ");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await queryContext(options.projectRoot, query), null, 2)
          }
        ]
      };
    }
  );

  return server;
}

export async function startMcpServer(projectRoot: string): Promise<void> {
  const server = createMcpServer({ projectRoot });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
