import { randomBytes } from "node:crypto";
import { type Auth, google } from "googleapis";
import openBrowser from "open";
import { AuthError } from "../errors/index.js";
import { captureAuthCode } from "./loopback.js";
import { type StoredTokens, loadTokens, saveTokens } from "./token-store.js";

export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
export const ALL_SCOPES = [...GOOGLE_HEALTH_SCOPES, ...DRIVE_SCOPES];

export interface AuthOptions {
  clientId: string;
  clientSecret: string;
  tokensPath: string;
  scopes?: string[];
  openBrowser?: (url: string) => Promise<unknown>;
}

export interface ManualLoginOptions extends Omit<AuthOptions, "openBrowser"> {
  redirectUri?: string;
  state?: string;
}

export interface ManualLoginSession {
  authUrl: string;
  redirectUri: string;
  state: string;
  complete(redirectUrl: string): Promise<StoredTokens>;
}

const DEFAULT_MANUAL_REDIRECT_URI = "http://127.0.0.1:53682/callback";

export async function login(opts: AuthOptions): Promise<StoredTokens> {
  const state = randomBytes(16).toString("hex");
  const capture = captureAuthCode({ state });
  const { port, promise } = await capture.ready;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret, redirectUri);
  const scopes = opts.scopes ?? ALL_SCOPES;
  const authUrl = generateAuthUrl(oauth2, scopes, state);

  const open = opts.openBrowser ?? (async (url: string) => openBrowser(url));
  await open(authUrl);

  const code = await promise;
  return exchangeCode({ oauth2, code, tokensPath: opts.tokensPath, scopes });
}

export function createManualLoginSession(opts: ManualLoginOptions): ManualLoginSession {
  const state = opts.state ?? randomBytes(16).toString("hex");
  const redirectUri = opts.redirectUri ?? DEFAULT_MANUAL_REDIRECT_URI;
  const scopes = opts.scopes ?? ALL_SCOPES;
  const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret, redirectUri);
  return {
    authUrl: generateAuthUrl(oauth2, scopes, state),
    redirectUri,
    state,
    complete: async (redirectUrl: string) =>
      exchangeCode({
        oauth2,
        code: parseManualRedirectUrl(redirectUrl, state),
        tokensPath: opts.tokensPath,
        scopes,
      }),
  };
}

function generateAuthUrl(oauth2: Auth.OAuth2Client, scopes: string[], state: string): string {
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: scopes,
    state,
  });
}

async function exchangeCode(opts: {
  oauth2: Auth.OAuth2Client;
  code: string;
  tokensPath: string;
  scopes: string[];
}): Promise<StoredTokens> {
  const { tokens } = await opts.oauth2.getToken(opts.code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new AuthError("incomplete token response from Google");
  }
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(tokens.expiry_date).toISOString(),
    scope: String(tokens.scope ?? opts.scopes.join(" ")),
  };
  await saveTokens(opts.tokensPath, stored);
  return stored;
}

function parseManualRedirectUrl(redirectUrl: string, expectedState: string): string {
  let url: URL;
  try {
    url = new URL(redirectUrl.trim());
  } catch {
    throw new AuthError("invalid OAuth redirect URL");
  }

  const error = url.searchParams.get("error");
  if (error) throw new AuthError(`OAuth authorization failed: ${error}`);

  const state = url.searchParams.get("state");
  if (state !== expectedState) throw new AuthError("OAuth state mismatch — possible CSRF");

  const code = url.searchParams.get("code");
  if (!code) throw new AuthError("OAuth redirect URL missing code");
  return code;
}

export async function getAuthenticatedClient(
  opts: Omit<AuthOptions, "openBrowser">,
): Promise<Auth.OAuth2Client> {
  const tokens = await loadTokens(opts.tokensPath);
  if (!tokens) throw new AuthError("no stored tokens — run `healthsync auth login` first");

  const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret);
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.parse(tokens.expires_at),
    scope: tokens.scope,
  });

  oauth2.on("tokens", (newTokens) => {
    if (!newTokens.access_token || !newTokens.expiry_date) return;
    void saveTokens(opts.tokensPath, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expires_at: new Date(newTokens.expiry_date).toISOString(),
      scope: String(newTokens.scope ?? tokens.scope),
    });
  });

  return oauth2;
}

export async function authStatus(opts: { tokensPath: string }): Promise<
  { authenticated: false } | { authenticated: true; expiresAt: string; scope: string }
> {
  const tokens = await loadTokens(opts.tokensPath);
  if (!tokens) return { authenticated: false };
  return { authenticated: true, expiresAt: tokens.expires_at, scope: tokens.scope };
}

export async function logout(opts: { tokensPath: string }): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(opts.tokensPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
