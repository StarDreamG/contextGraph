import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/loadConfig.js";
import { scanSources } from "../indexing/scanner.js";
import { indexContextGraph } from "./indexService.js";
import { clearWatcherSnapshot, writeWatcherSnapshot } from "./watchState.js";

export interface WatchOptions {
  debounceMs?: number;
  silent?: boolean;
}

export interface ContextGraphWatcher {
  close: () => Promise<void>;
}

export async function startContextGraphWatcher(
  projectRoot: string,
  options: WatchOptions = {}
): Promise<ContextGraphWatcher> {
  const resolvedRoot = path.resolve(projectRoot);
  const debounceMs = options.debounceMs ?? 500;
  const startedAt = new Date().toISOString();
  const watchers = new Map<string, FSWatcher>();
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  async function refreshWatchedSources(): Promise<void> {
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();

    const config = await loadConfig(resolvedRoot);
    const sources = await scanSources(resolvedRoot, config);
    for (const source of sources) {
      const absolutePath = path.join(resolvedRoot, source);
      if (watchers.has(absolutePath)) {
        continue;
      }
      watchers.set(
        absolutePath,
        watch(absolutePath, () => {
          scheduleIndex();
        })
      );
    }

    await writeWatcherSnapshot(resolvedRoot, {
      pid: process.pid,
      startedAt,
      updatedAt: new Date().toISOString(),
      watchedSources: sources.length
    });
    log(options, `ContextGraph watcher is watching ${sources.length} source file${sources.length === 1 ? "" : "s"}.`);
  }

  function scheduleIndex(): void {
    if (closed) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      void runIndex();
    }, debounceMs);
  }

  async function runIndex(): Promise<void> {
    if (closed) {
      return;
    }
    try {
      const result = await indexContextGraph(resolvedRoot);
      log(options, `ContextGraph watcher indexed ${result.sourcesChanged} changed source(s).`);
      await refreshWatchedSources();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(options, `ContextGraph watcher failed: ${message}`);
    }
  }

  await refreshWatchedSources();

  return {
    close: async () => {
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      await clearWatcherSnapshot(resolvedRoot);
    }
  };
}

function log(options: WatchOptions, message: string): void {
  if (!options.silent) {
    console.error(message);
  }
}
