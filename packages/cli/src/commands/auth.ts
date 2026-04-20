import { Command } from "commander";
import { auth } from "@healthsync/core";

export interface AuthCommandDeps {
  paths: { tokens: string };
  credentials: { clientId: string; clientSecret: string };
  writeLine: (s: string) => void;
  openBrowser: (url: string) => Promise<unknown>;
}

export function buildAuthCommand(deps: AuthCommandDeps): Command {
  const cmd = new Command("auth").description("OAuth authorisation");

  cmd
    .command("login")
    .description("Authorise with Google and store tokens")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const tokens = await auth.login({
        clientId: deps.credentials.clientId,
        clientSecret: deps.credentials.clientSecret,
        tokensPath: deps.paths.tokens,
        openBrowser: deps.openBrowser,
      });
      if (opts.json) {
        deps.writeLine(JSON.stringify({ authenticated: true, expiresAt: tokens.expires_at }));
      } else {
        deps.writeLine(`Authorised. Token expires at ${tokens.expires_at}.`);
      }
    });

  cmd
    .command("status")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const s = await auth.authStatus({ tokensPath: deps.paths.tokens });
      if (opts.json) deps.writeLine(JSON.stringify(s));
      else deps.writeLine(s.authenticated ? `Authenticated (expires ${s.expiresAt})` : "Not authenticated");
    });

  cmd
    .command("logout")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      await auth.logout({ tokensPath: deps.paths.tokens });
      if (opts.json) deps.writeLine(JSON.stringify({ ok: true }));
      else deps.writeLine("Logged out.");
    });

  return cmd;
}
