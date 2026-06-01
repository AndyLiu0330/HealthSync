import type { HealthSyncConfig } from "@healthsync/core";
import { Command } from "commander";

export interface ConfigDeps {
  loadConfig: () => Promise<HealthSyncConfig>;
  writeLine: (s: string) => void;
}

export function buildConfigCommand(deps: ConfigDeps): Command {
  const cmd = new Command("config").description("Inspect HealthSync configuration");
  cmd
    .command("show")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const cfg = await deps.loadConfig();
      if (opts.json) deps.writeLine(JSON.stringify(cfg, null, 2));
      else for (const [k, v] of Object.entries(cfg)) deps.writeLine(`${k}: ${JSON.stringify(v)}`);
    });
  return cmd;
}
