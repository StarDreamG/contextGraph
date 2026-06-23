#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "../commands/initCommand.js";

export function buildProgram(): Command {
  const program = new Command();
  program.name("contextgraph").description("Local-first context graph for coding agents.");
  registerInitCommand(program);
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
