import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function stableId(...parts: string[]): string {
  return sha256(parts.join("\u001f")).slice(0, 32);
}
