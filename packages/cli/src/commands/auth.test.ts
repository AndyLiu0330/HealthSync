import { auth } from "@healthsync/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAuthCommand } from "./auth.js";

describe("auth command", () => {
  afterEach(() => vi.restoreAllMocks());

  it("status prints { authenticated: false } when no tokens", async () => {
    const out: string[] = [];
    const cmd = buildAuthCommand({
      paths: { tokens: "/tmp/does-not-exist-xyz.json" },
      credentials: { clientId: "x", clientSecret: "y" },
      writeLine: (s) => out.push(s),
      openBrowser: vi.fn(),
      readLine: vi.fn(),
    });
    await cmd.parseAsync(["node", "healthsync", "status", "--json"]);
    const last = JSON.parse(out[out.length - 1] ?? "{}");
    expect(last).toEqual({ authenticated: false });
  });

  it("manual login prints the auth URL and completes from a pasted redirect URL", async () => {
    const complete = vi.fn(async (_redirectUrl: string) => ({
      access_token: "AT",
      refresh_token: "RT",
      expires_at: "2026-04-19T12:00:00.000Z",
      scope: "scope-a",
    }));
    vi.spyOn(auth, "createManualLoginSession").mockReturnValue({
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=STATE",
      redirectUri: "http://127.0.0.1:53682/callback",
      state: "STATE",
      complete,
    });

    const out: string[] = [];
    const readLine = vi.fn(async () => "http://127.0.0.1:53682/callback?state=STATE&code=CODE");
    const cmd = buildAuthCommand({
      paths: { tokens: "/tmp/tokens.json" },
      credentials: { clientId: "client-id", clientSecret: "client-secret" },
      writeLine: (s) => out.push(s),
      openBrowser: vi.fn(),
      readLine,
    });

    await cmd.parseAsync(["node", "healthsync", "login", "--manual"]);

    expect(auth.createManualLoginSession).toHaveBeenCalledWith({
      clientId: "client-id",
      clientSecret: "client-secret",
      tokensPath: "/tmp/tokens.json",
    });
    expect(out).toContain("https://accounts.google.com/o/oauth2/v2/auth?state=STATE");
    expect(readLine).toHaveBeenCalledWith("Paste the full redirect URL here: ");
    expect(complete).toHaveBeenCalledWith("http://127.0.0.1:53682/callback?state=STATE&code=CODE");
    expect(out.at(-1)).toBe("Authorised. Token expires at 2026-04-19T12:00:00.000Z.");
  });
});
