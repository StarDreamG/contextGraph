import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TempProject {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createTempProject(): Promise<TempProject> {
  const root = await mkdtemp(path.join(os.tmpdir(), "contextgraph-project-"));
  await execFileAsync("git", ["init", "-b", "main"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}
