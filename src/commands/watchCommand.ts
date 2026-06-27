import type { Command } from "commander";
import { startContextGraphWatcher } from "../core/watchService.js";

interface WatchOptions {
  debounce?: string;
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Watch configured ContextGraph sources and reindex on local changes")
    .option("--debounce <ms>", "Debounce file change events before indexing", "500")
    .action(async (options: WatchOptions) => {
      const debounceMs = readDebounce(options.debounce);
      const watcher = await startContextGraphWatcher(process.cwd(), { debounceMs });
      console.error("ContextGraph watcher started. Press Ctrl+C to stop.");

      const shutdown = async () => {
        await watcher.close();
        process.exit(0);
      };

      process.once("SIGINT", () => {
        void shutdown();
      });
      process.once("SIGTERM", () => {
        void shutdown();
      });

      await new Promise(() => {
        // Keep stdio watcher process alive until a signal arrives.
      });
    });
}

function readDebounce(value: string | undefined): number {
  const parsed = Number(value ?? "500");
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("--debounce must be a non-negative number of milliseconds.");
  }
  return parsed;
}
