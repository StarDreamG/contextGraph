import path from "node:path";
import type { Command } from "commander";
import { runDoctor } from "../core/doctorService.js";

interface DoctorOptions {
  project?: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check ContextGraph runtime and project index health")
    .option("-p, --project <path>", "Project root to inspect", process.cwd())
    .action(async (options: DoctorOptions) => {
      const report = await runDoctor(path.resolve(options.project ?? process.cwd()));
      console.log("ContextGraph Doctor");
      console.log("────────────────────────────────");
      console.log(`Project:             ${report.projectRoot}`);
      console.log(`Node version:        ${report.nodeVersion}`);
      console.log(`Node supported:      ${report.nodeSupported ? "yes" : "no"}`);
      console.log(`SQLite native:       ${report.sqliteNative ? "yes" : "no"}`);
      console.log(`Project initialized: ${report.projectInitialized ? "yes" : "no"}`);
      console.log(`Index status:        ${report.indexStatus}`);
      console.log(`Reliability:         ${report.reliability}`);
      console.log(`Sources:             ${report.sourceCount}`);
      console.log(`Nodes:               ${report.nodeCount}`);
      console.log(`Edges:               ${report.edgeCount}`);
      if (report.warnings.length > 0) {
        console.log("Warnings:");
        for (const warning of report.warnings) {
          console.log(warning);
        }
      }
    });
}
