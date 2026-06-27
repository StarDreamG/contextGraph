import { access } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ContextQueryResponse } from "../core/queryService.js";
import { queryContext } from "../core/queryService.js";
import { getContextStatus } from "../core/statusService.js";
import { buildQueryPlan } from "../query/queryPlanner.js";
import type { StatusSnapshot } from "../types/domain.js";

export interface McpServerOptions {
  projectRoot: string;
}

export interface McpDiagnostics {
  projectRoot: string;
  graphDir: string;
  configPath: string;
  dbPath: string;
  initialized: boolean;
  indexed: boolean;
  status: StatusSnapshot["status"];
  reliability: StatusSnapshot["reliability"];
  lastIndexedAt: string | null;
  nextAction: string;
  mcpProcess: {
    mode: "stdio";
    startedAt: string;
    lastReloadedAt: string | null;
    refresh: "lazy-per-call";
  };
}

export interface McpStatusResponse {
  status: StatusSnapshot;
  diagnostics: McpDiagnostics;
  reloadedAt?: string;
}

export type McpRelevantContextResponse = ContextQueryResponse & {
  diagnostics: McpDiagnostics;
};

interface RelevantContextInput {
  task: string;
  files?: string[];
}

export class ContextGraphMcpRuntime {
  private readonly projectRoot: string;
  private readonly startedAt = new Date().toISOString();
  private lastReloadedAt: string | null = null;

  constructor(options: McpServerOptions) {
    this.projectRoot = path.resolve(options.projectRoot);
  }

  async getStatus(): Promise<McpStatusResponse> {
    const status = await getContextStatus(this.projectRoot);
    return {
      status,
      diagnostics: await this.getDiagnostics(status)
    };
  }

  async reload(): Promise<McpStatusResponse> {
    this.lastReloadedAt = new Date().toISOString();
    const status = await this.getStatus();
    return {
      ...status,
      reloadedAt: this.lastReloadedAt
    };
  }

  async getRelevantContext(input: RelevantContextInput): Promise<McpRelevantContextResponse> {
    const query = [input.task, ...(input.files ?? [])].join(" ").trim();
    const status = await this.getStatus();
    if (!status.diagnostics.initialized) {
      return this.emptyContext(query, status, ["ContextGraph is not initialized. Run: contextgraph init"], [
        "run contextgraph init",
        "run contextgraph index"
      ]);
    }
    if (!status.diagnostics.indexed) {
      return this.emptyContext(query, status, ["ContextGraph is not indexed. Run: contextgraph index"], [
        "run contextgraph index"
      ]);
    }

    return {
      ...(await queryContext(this.projectRoot, query)),
      diagnostics: status.diagnostics
    };
  }

  private async getDiagnostics(status: StatusSnapshot): Promise<McpDiagnostics> {
    const graphDir = path.join(this.projectRoot, ".contextgraph");
    const configPath = path.join(graphDir, "config.json");
    const dbPath = path.join(graphDir, "graph.db");
    const [hasConfig, hasDb] = await Promise.all([exists(configPath), exists(dbPath)]);
    const initialized = hasConfig && hasDb;
    const indexed = initialized && status.lastIndexedAt !== null && status.sourceCount > 0;

    return {
      projectRoot: this.projectRoot,
      graphDir,
      configPath,
      dbPath,
      initialized,
      indexed,
      status: status.status,
      reliability: status.reliability,
      lastIndexedAt: status.lastIndexedAt,
      nextAction: nextAction(initialized, indexed, status),
      mcpProcess: {
        mode: "stdio",
        startedAt: this.startedAt,
        lastReloadedAt: this.lastReloadedAt,
        refresh: "lazy-per-call"
      }
    };
  }

  private emptyContext(
    query: string,
    status: McpStatusResponse,
    warnings: string[],
    suggestions: string[]
  ): McpRelevantContextResponse {
    return {
      query,
      queryPlan: buildQueryPlan(query),
      status: status.status,
      diagnostics: status.diagnostics,
      results: [],
      warnings,
      suggestions
    };
  }
}

export function createMcpServer(options: McpServerOptions): McpServer {
  const runtime = new ContextGraphMcpRuntime(options);
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
          text: JSON.stringify(await runtime.getStatus(), null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "diagnose_contextgraph",
    {
      description: "Return MCP diagnostics including project path, database path, initialization state, and next action."
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify((await runtime.getStatus()).diagnostics, null, 2)
        }
      ]
    })
  );

  server.registerTool(
    "reload_contextgraph",
    {
      description: "Force the ContextGraph MCP runtime to refresh local config and database diagnostics."
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await runtime.reload(), null, 2)
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await runtime.getRelevantContext({ task, files }), null, 2)
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

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function nextAction(initialized: boolean, indexed: boolean, status: StatusSnapshot): string {
  if (!initialized) {
    return "Run contextgraph init";
  }
  if (!indexed) {
    return "Run contextgraph index";
  }
  if (status.status === "Stale") {
    return "Run contextgraph index";
  }
  return "No action required.";
}
