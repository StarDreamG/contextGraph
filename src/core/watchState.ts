import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WatcherSnapshot } from "../types/domain.js";

interface WatcherStateFile {
  pid: number;
  startedAt: string;
  updatedAt: string;
  watchedSources: number;
}

export function stoppedWatcher(): WatcherSnapshot {
  return {
    status: "stopped",
    mode: "disabled",
    message: "Watcher is not running. Run contextgraph index manually after source changes."
  };
}

export async function readWatcherSnapshot(projectRoot: string): Promise<WatcherSnapshot> {
  const state = await readWatcherState(projectRoot);
  if (!state || !isProcessAlive(state.pid)) {
    return stoppedWatcher();
  }

  return {
    status: "watching",
    mode: "local",
    message: `Watching ${state.watchedSources} source file${state.watchedSources === 1 ? "" : "s"}.`,
    pid: state.pid,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    watchedSources: state.watchedSources
  };
}

export async function writeWatcherSnapshot(projectRoot: string, input: WatcherStateFile): Promise<void> {
  await writeFile(watcherStatePath(projectRoot), `${JSON.stringify(input, null, 2)}\n`);
}

export async function clearWatcherSnapshot(projectRoot: string): Promise<void> {
  await rm(watcherStatePath(projectRoot), { force: true });
}

function watcherStatePath(projectRoot: string): string {
  return path.join(projectRoot, ".contextgraph", "watcher.json");
}

async function readWatcherState(projectRoot: string): Promise<WatcherStateFile | null> {
  try {
    const raw = await readFile(watcherStatePath(projectRoot), "utf8");
    const parsed = JSON.parse(raw) as Partial<WatcherStateFile>;
    if (
      typeof parsed.pid === "number" &&
      typeof parsed.startedAt === "string" &&
      typeof parsed.updatedAt === "string" &&
      typeof parsed.watchedSources === "number"
    ) {
      return parsed as WatcherStateFile;
    }
    return null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
