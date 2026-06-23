import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ContextGraphConfig } from "../types/domain.js";

const configSchema = z.object({
  version: z.literal(1),
  projectName: z.string(),
  sources: z.array(z.string()).min(1),
  ignore: z.array(z.string()),
  privacy: z.object({
    offline: z.literal(true),
    allowRemoteLLM: z.literal(false),
    redactSecrets: z.literal(true)
  })
});

export async function loadConfig(projectRoot: string): Promise<ContextGraphConfig> {
  const configPath = path.join(projectRoot, ".contextgraph", "config.json");
  const raw = await readFile(configPath, "utf8");
  return configSchema.parse(JSON.parse(raw));
}
