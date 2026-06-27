#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerBriefCommand } from "../commands/briefCommand.js";
import { registerDoctorCommand } from "../commands/doctorCommand.js";
import { registerExplainQueryCommand } from "../commands/explainQueryCommand.js";
import { registerHandoffCommand } from "../commands/handoffCommand.js";
import { registerIndexCommand } from "../commands/indexCommand.js";
import { registerInitCommand } from "../commands/initCommand.js";
import { registerMcpCommand } from "../commands/mcpCommand.js";
import { registerQueryCommand } from "../commands/queryCommand.js";
import { registerStatusCommand } from "../commands/statusCommand.js";
import { registerWatchCommand } from "../commands/watchCommand.js";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("contextgraph")
    .description("Local-first context graph for coding agents.")
    .version(readPackageVersion());
  registerInitCommand(program);
  registerIndexCommand(program);
  registerStatusCommand(program);
  registerWatchCommand(program);
  registerDoctorCommand(program);
  registerBriefCommand(program);
  registerQueryCommand(program);
  registerExplainQueryCommand(program);
  registerHandoffCommand(program);
  registerMcpCommand(program);
  return program;
}

function readPackageVersion(): string {
  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as { version?: unknown };
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error("ContextGraph package version is missing.");
  }
  return packageJson.version;
}

export async function main(argv = process.argv): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
