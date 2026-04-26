import { auth } from "@healthsync/core";
import { Command } from "commander";

export interface AuthCommandDeps {
  paths: { tokens: string };
  credentials: { clientId: string; clientSecret: string };
  writeLine: (s: string) => void;
  readLine: (prompt: string) => Promise<string>;
  openBrowser: (url: string) => Promise<unknown>;
}

export function buildAuthCommand(deps: AuthCommandDeps): Command {
  const cmd = new Command("auth").description("OAuth authorisation");

  cmd
    .command("login")
    .description("Authorise with Google and store tokens")
    .option("--manual", "print the auth URL and ask for the pasted redirect URL")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean; manual?: boolean }) => {
      const tokens = opts.manual ? await manualLogin(deps, opts.json) : await loopbackLogin(deps);
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
      else
        deps.writeLine(
          s.authenticated ? `Authenticated (expires ${s.expiresAt})` : "Not authenticated",
        );
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

async function loopbackLogin(deps: AuthCommandDeps) {
  return auth.login({
    clientId: deps.credentials.clientId,
    clientSecret: deps.credentials.clientSecret,
    tokensPath: deps.paths.tokens,
    openBrowser: deps.openBrowser,
  });
}

async function manualLogin(deps: AuthCommandDeps, json = false) {
  const session = auth.createManualLoginSession({
    clientId: deps.credentials.clientId,
    clientSecret: deps.credentials.clientSecret,
    tokensPath: deps.paths.tokens,
  });
  if (json) {
    deps.writeLine(
      JSON.stringify({
        authUrl: session.authUrl,
        redirectUri: session.redirectUri,
      }),
    );
  } else {
    deps.writeLine("Open this URL in your local browser:");
    deps.writeLine(session.authUrl);
    deps.writeLine("");
    deps.writeLine(
      `After Google redirects to ${session.redirectUri}, copy the full browser URL and paste it below.`,
    );
  }
  const redirectUrl = await deps.readLine("Paste the full redirect URL here: ");
  return session.complete(redirectUrl);
}
