import fg from "fast-glob";
import path from "node:path";
import { isSensitivePath } from "../security/redaction.js";
import type { ContextGraphConfig } from "../types/domain.js";

export async function scanSources(projectRoot: string, config: ContextGraphConfig): Promise<string[]> {
  const entries = await fg(config.sources, {
    cwd: projectRoot,
    dot: true,
    onlyFiles: true,
    ignore: config.ignore
  });

  return entries
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry) => !isSensitivePath(entry))
    .sort();
}
