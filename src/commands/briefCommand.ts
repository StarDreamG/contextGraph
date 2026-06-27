import path from "node:path";
import type { Command } from "commander";
import { getBrief, type BriefItem, type BriefSection } from "../core/briefService.js";

interface BriefOptions {
  project?: string;
  task?: string;
  file?: string;
  domain?: string;
}

export function registerBriefCommand(program: Command): void {
  program
    .command("brief")
    .description("Show the highest-priority context for a new agent")
    .option("-p, --project <path>", "Project root to summarize", process.cwd())
    .option("--task <task>", "Task-aware brief scope")
    .option("--file <path>", "File-aware brief scope")
    .option("--domain <domain>", "Domain-aware brief scope")
    .action(async (options: BriefOptions) => {
      const brief = await getBrief(path.resolve(options.project ?? process.cwd()), {
        task: options.task,
        file: options.file,
        domain: options.domain
      });
      console.log("ContextGraph Brief");
      console.log("────────────────────────────────");
      console.log(`Project:     ${brief.projectRoot}`);
      if (brief.request.task) console.log(`Task:       ${brief.request.task}`);
      if (brief.request.file) console.log(`File:       ${brief.request.file}`);
      if (brief.request.domain) console.log(`Domain:     ${brief.request.domain}`);
      console.log(`Status:      ${brief.status.status}`);
      console.log(`Reliability: ${brief.status.reliability}`);
      for (const warning of brief.warnings) {
        console.log(`Warning: ${warning}`);
      }
      printSection(brief.sections.p0Rules);
      printSection(brief.sections.currentSourceOfTruth);
      printSection(brief.sections.requiredTests);
      printSection(brief.sections.environmentWarnings);
      printSection(brief.sections.recentHandoff);
      printSection(brief.sections.deprecatedContext);
      printSection(brief.sections.knownFailureModes);
      printSection(brief.sections.relatedFiles);
      console.log(brief.sections.toolProfile.title);
      console.log(`- ${brief.sections.toolProfile.message}`);
    });
}

function printSection(section: BriefSection): void {
  console.log(section.title);
  if (section.items.length === 0) {
    console.log("- No indexed context yet.");
    return;
  }
  for (const item of section.items) {
    console.log(`- [${item.priority} ${item.type}] ${item.title}`);
    console.log(`  ${item.content}`);
    const source = formatSource(item);
    if (source) {
      console.log(`  Source: ${source}`);
    }
  }
}

function formatSource(item: BriefItem): string | null {
  if (!item.sourcePath) {
    return null;
  }
  return `${item.sourcePath}:${item.startLine ?? "?"}-${item.endLine ?? "?"}`;
}
