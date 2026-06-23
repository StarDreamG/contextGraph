import type { Command } from "commander";
import { recordHandoff } from "../core/handoffService.js";

export function registerHandoffCommand(program: Command): void {
  program
    .command("handoff")
    .description("Record an agent handoff summary")
    .requiredOption("--agent <agent>", "Agent name")
    .requiredOption("--task <task>", "Task description")
    .requiredOption("--summary <summary>", "Handoff summary")
    .option("--files <files>", "Comma-separated related files")
    .action(async (options: { agent: string; task: string; summary: string; files?: string }) => {
      const result = await recordHandoff(process.cwd(), {
        agent: options.agent,
        task: options.task,
        summary: options.summary,
        files: options.files
          ?.split(",")
          .map((file) => file.trim())
          .filter(Boolean)
      });
      console.log("Handoff recorded.");
      console.log(`Session: ${result.sessionId}`);
      console.log(`Agent: ${result.agent}`);
      console.log(`Task: ${result.task}`);
      console.log(`Git HEAD: ${result.gitHead ?? "none"}`);
      console.log(`Nodes created: ${result.nodesCreated}`);
    });
}
