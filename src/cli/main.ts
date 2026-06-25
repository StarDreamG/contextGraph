#!/usr/bin/env node
import { Command } from "commander";
import { registerDoctorCommand } from "../commands/doctorCommand.js";
import { registerHandoffCommand } from "../commands/handoffCommand.js";
import { registerIndexCommand } from "../commands/indexCommand.js";
import { registerInitCommand } from "../commands/initCommand.js";
import { registerMcpCommand } from "../commands/mcpCommand.js";
import { registerQueryCommand } from "../commands/queryCommand.js";
import { registerStatusCommand } from "../commands/statusCommand.js";

export function buildProgram(): Command {
  const program = new Command();
  program.name("contextgraph").description("Local-first context graph for coding agents.");
  registerInitCommand(program);
  registerIndexCommand(program);
  registerStatusCommand(program);
  registerDoctorCommand(program);
  registerQueryCommand(program);
  registerHandoffCommand(program);
  registerMcpCommand(program);
  return program;
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
