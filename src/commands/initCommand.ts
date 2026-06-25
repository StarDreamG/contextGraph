import type { Command } from "commander";
import { initContextGraph } from "../core/initService.js";

export function registerInitCommand(program: Command): void {
  program.command("init").description("Initialize ContextGraph in the current project").action(async () => {
    const result = await initContextGraph(process.cwd());
    console.log("ContextGraph initialized.");
    console.log(`Project: ${result.projectRoot}`);
    console.log(`Graph: ${result.createdGraphDir}`);
  });
}
