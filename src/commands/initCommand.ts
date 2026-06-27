import type { Command } from "commander";
import { isSourcePreset } from "../config/presets.js";
import { initContextGraph } from "../core/initService.js";
import type { SourcePreset } from "../types/domain.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize ContextGraph in the current project")
    .option("--preset <preset>", "Initial source preset: auto, basic, project, api, source-comments, source")
    .action(async (options: { preset?: string }) => {
      const preset = parseInitPreset(options.preset);
      const result = await initContextGraph(process.cwd(), { preset });
      console.log("ContextGraph initialized.");
      console.log(`Project: ${result.projectRoot}`);
      console.log(`Graph: ${result.createdGraphDir}`);
      console.log(`Presets: ${result.presets.length === 0 ? "none" : result.presets.join(", ")}`);
    });
}

function parseInitPreset(value: string | undefined): SourcePreset | "auto" | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "auto") {
    return "auto";
  }
  if (isSourcePreset(value)) {
    return value;
  }
  throw new Error(`Unknown preset "${value}".`);
}
