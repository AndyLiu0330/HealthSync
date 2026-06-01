#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import {
  type DataType,
  DriveClient,
  HealthClient,
  auth,
  loadConfig,
  loadSyncState,
  runSync,
  updateLastSync,
  version,
} from "@healthsync/core";
import { Command } from "commander";
import { buildAuthCommand, buildConnectCommand } from "./commands/auth.js";
import { buildConfigCommand } from "./commands/config.js";
import { buildListCommand } from "./commands/list.js";
import { buildSyncCommand } from "./commands/sync.js";
import { loadEnvFile } from "./env.js";
import { configPath, statePath, tokensPath } from "./paths.js";

loadEnvFile();

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.HEALTHSYNC_CLIENT_ID;
  const clientSecret = process.env.HEALTHSYNC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("HEALTHSYNC_CLIENT_ID and HEALTHSYNC_CLIENT_SECRET must be set (see README).");
    process.exit(2);
  }
  return { clientId, clientSecret };
}

/**
 * True when argv only wants help or version info, or no subcommand at all.
 * In those cases commander prints usage and exits without invoking any action,
 * so we must not hard-fail on missing env-var credentials.
 */
function isHelpOrVersionInvocation(argv: string[]): boolean {
  // argv[0] = node, argv[1] = script, remaining are user args
  const args = argv.slice(2);
  if (args.length === 0) return true;
  return args.some(
    (a) => a === "-h" || a === "--help" || a === "-V" || a === "--version" || a === "help",
  );
}

/** Cross-platform "open this URL in the user's browser" without pulling in `open`. */
function openBrowser(url: string): Promise<void> {
  const { platform } = process;
  const cmd = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      child.on("error", () => resolve());
      child.unref();
    } catch {
      // Fall through — caller prints URL separately; user can open manually.
    }
    resolve();
  });
}

async function readLine(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function buildSyncDeps(): Promise<{
  health: HealthClient;
  drive: DriveClient;
  state: {
    get: () => Promise<{ lastSync: Partial<Record<DataType, string>> }>;
    setType: (type: DataType, iso: string) => Promise<void>;
  };
  driveRoot: string;
  types: DataType[];
}> {
  const cfg = await loadConfig(configPath());
  const credentials = getCredentials();
  const driveClient = await auth.getAuthenticatedClient({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    tokensPath: tokensPath(),
  });
  let healthToken: Awaited<ReturnType<typeof auth.getScopedAccessToken>> | undefined;
  const healthAuth = {
    async getAccessToken(): Promise<{ token?: string | null }> {
      if (healthToken && Date.parse(healthToken.expiresAt) - Date.now() > 60_000) {
        return { token: healthToken.token };
      }
      healthToken = await auth.getScopedAccessToken({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        tokensPath: tokensPath(),
        scopes: auth.GOOGLE_HEALTH_SCOPES,
      });
      return { token: healthToken.token };
    },
  };
  return {
    health: new HealthClient(healthAuth),
    drive: new DriveClient(driveClient),
    state: {
      async get() {
        return loadSyncState(statePath());
      },
      async setType(type, iso) {
        await updateLastSync(statePath(), type, iso);
      },
    },
    driveRoot: cfg.driveRootFolder,
    types: cfg.dataTypes,
  };
}

async function main(): Promise<void> {
  const program = new Command("healthsync")
    .description("Sync Pixel Watch health data to Google Drive")
    .version(version);

  // Sanctioned deviation from plan: only resolve credentials when the user is
  // actually running a command that needs them. Running `healthsync --help` or
  // `healthsync --version` should not fail on missing env vars.
  const credentials = isHelpOrVersionInvocation(process.argv)
    ? { clientId: "", clientSecret: "" }
    : getCredentials();

  program.addCommand(
    buildAuthCommand({
      paths: { tokens: tokensPath() },
      credentials,
      writeLine: (s) => console.log(s),
      readLine,
      openBrowser: (url) => openBrowser(url),
    }),
  );

  program.addCommand(
    buildConnectCommand({
      paths: { tokens: tokensPath() },
      credentials,
      writeLine: (s) => console.log(s),
      readLine,
      openBrowser: (url) => openBrowser(url),
    }),
  );

  program.addCommand(
    buildSyncCommand({
      buildDeps: buildSyncDeps,
      runSync,
      writeLine: (s) => console.log(s),
      now: () => new Date(),
    }),
  );

  program.addCommand(
    buildListCommand({
      buildDrive: async () => {
        const d = await buildSyncDeps();
        return { drive: d.drive, driveRoot: d.driveRoot };
      },
      writeLine: (s) => console.log(s),
    }),
  );

  program.addCommand(
    buildConfigCommand({
      loadConfig: () => loadConfig(configPath()),
      writeLine: (s) => console.log(s),
    }),
  );

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
