import { pathToFileURL } from "node:url";
import type {
  DashboardDrivePort,
  DashboardRange,
  DataType,
  HealthPort,
  RunDashboardParams,
  RunDashboardResult,
  StatePort,
} from "@healthsync/core";
import { Command, Option } from "commander";

export interface DashboardDeps {
  buildDeps: () => Promise<{
    health: HealthPort;
    drive: DashboardDrivePort;
    state: StatePort;
    driveRoot: string;
    types: DataType[];
  }>;
  runDashboard: (p: RunDashboardParams) => Promise<RunDashboardResult>;
  saveLocal: (html: string) => Promise<string>; // returns the path written
  openBrowser: (url: string) => Promise<void>;
  writeLine: (s: string) => void;
  now: () => Date;
}

export function buildDashboardCommand(deps: DashboardDeps): Command {
  return new Command("dashboard")
    .description("Sync a date range and generate a static HTML dashboard")
    .addOption(
      new Option("--range <range>", "how far back to sync and display")
        .choices(["day", "week", "month"])
        .default("week"),
    )
    .action(async (opts: { range: DashboardRange }) => {
      const base = await deps.buildDeps();
      const result = await deps.runDashboard({ ...base, now: deps.now(), range: opts.range });

      const localPath = await deps.saveLocal(result.html);
      deps.writeLine(`Range: ${result.dates[0]} .. ${result.dates[result.dates.length - 1]}`);
      deps.writeLine(
        `Synced ${result.syncedDates.length} day(s), reused ${
          result.dates.length - result.syncedDates.length
        } already in Drive`,
      );
      for (const e of result.errors) {
        deps.writeLine(`  warning: ${e.date} ${e.type}: ${e.error}`);
      }
      deps.writeLine(`Dashboard: ${localPath}`);
      deps.writeLine(`Drive file id: ${result.driveFileId}`);
      await deps.openBrowser(pathToFileURL(localPath).href);
    });
}
