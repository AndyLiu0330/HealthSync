import { Command } from "commander";
import type { DrivePort } from "@healthsync/core";

export interface ListDeps {
  buildDrive: () => Promise<{ drive: DrivePort; driveRoot: string }>;
  writeLine: (s: string) => void;
}

export function buildListCommand(deps: ListDeps): Command {
  return new Command("list")
    .description("List synced files in Drive (raw/ layer)")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const { drive, driveRoot } = await deps.buildDrive();
      const folderId = await drive.ensureFolderPath([driveRoot, "raw"]);
      const children = await drive.listChildren(folderId);
      if (opts.json) {
        deps.writeLine(JSON.stringify(children));
      } else {
        for (const c of children) deps.writeLine(`${c.id}\t${c.name}`);
      }
    });
}
