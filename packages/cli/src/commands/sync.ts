import {
  type DataType,
  type DrivePort,
  type HealthPort,
  type RunSyncParams,
  type RunSyncResult,
  SUPPORTED_DATA_TYPES,
  type StatePort,
} from "@healthsync/core";
import { Command } from "commander";

export interface SyncDeps {
  buildDeps: () => Promise<{
    health: HealthPort;
    drive: DrivePort;
    state: StatePort;
    driveRoot: string;
    types: DataType[];
  }>;
  runSync: (p: RunSyncParams) => Promise<RunSyncResult>;
  writeLine: (s: string) => void;
  now: () => Date;
}

export function buildSyncCommand(deps: SyncDeps): Command {
  return new Command("sync")
    .description("Sync health data from Google Health API into Drive")
    .option("--full", "re-fetch all history (ignores state)")
    .option("--since <iso>", "start date, ISO 8601 UTC")
    .option("--types <list>", "comma-separated data types")
    .option("--dry-run", "fetch + transform but skip upload")
    .option("--force", "overwrite existing files in Drive")
    .option("--json", "machine-readable output")
    .action(
      async (opts: {
        full?: boolean;
        since?: string;
        types?: string;
        dryRun?: boolean;
        force?: boolean;
        json?: boolean;
      }) => {
        if (opts.dryRun) {
          process.stderr.write(
            "warning: --dry-run is not yet implemented; uploads will still happen\n",
          );
        }
        if (opts.full) {
          process.stderr.write(
            "warning: --full is not yet implemented; using default start time\n",
          );
        }
        const base = await deps.buildDeps();
        const types = opts.types
          ? opts.types
              .split(",")
              .map((t) => t.trim())
              .filter((t): t is DataType => (SUPPORTED_DATA_TYPES as readonly string[]).includes(t))
          : base.types;

        const params: RunSyncParams = {
          health: base.health,
          drive: base.drive,
          state: base.state,
          types,
          driveRoot: base.driveRoot,
          now: deps.now(),
          force: opts.force ?? false,
          ...(opts.since ? { since: opts.since } : {}),
        };
        const result = await deps.runSync(params);
        if (opts.json) {
          deps.writeLine(JSON.stringify(result));
        } else {
          deps.writeLine(`Date: ${result.date}`);
          for (const [type, r] of Object.entries(result.perType)) {
            deps.writeLine(`  ${type}: ${r.status}${r.error ? ` (${r.error})` : ""}`);
          }
          if (result.dailyMarkdownFileId) {
            deps.writeLine(`Daily note: ${result.dailyMarkdownFileId}`);
          }
        }
      },
    );
}
