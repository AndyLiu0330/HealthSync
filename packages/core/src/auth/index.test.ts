import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nock from "nock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ALL_SCOPES,
  DRIVE_SCOPES,
  GOOGLE_HEALTH_SCOPES,
  createManualLoginSession,
} from "./index.js";

async function tmpPath() {
  const dir = await mkdtemp(join(tmpdir(), "healthsync-auth-"));
  return join(dir, "tokens.json");
}

function bodyParams(body: unknown): URLSearchParams {
  if (typeof body === "string") return new URLSearchParams(body);
  if (body && typeof body === "object") {
    return new URLSearchParams(
      Object.entries(body as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    );
  }
  return new URLSearchParams();
}

describe("auth scopes", () => {
  beforeEach(() => nock.cleanAll());

  it("requests readonly Google Health v4 scopes for configured data types", () => {
    expect(GOOGLE_HEALTH_SCOPES).toEqual([
      "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
      "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
      "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
    ]);
    expect(ALL_SCOPES).toEqual([...GOOGLE_HEALTH_SCOPES, ...DRIVE_SCOPES]);
  });

  it("creates a manual login URL and completes from a pasted redirect URL", async () => {
    const tokensPath = await tmpPath();
    const tokenRequest = nock("https://oauth2.googleapis.com")
      .post("/token", (body) => {
        const params = bodyParams(body);
        expect(params.get("code")).toBe("CODE_FROM_GOOGLE");
        expect(params.get("client_id")).toBe("client-id");
        expect(params.get("client_secret")).toBe("client-secret");
        expect(params.get("redirect_uri")).toBe("http://127.0.0.1:53682/callback");
        expect(params.get("grant_type")).toBe("authorization_code");
        return true;
      })
      .reply(200, {
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
        scope: "scope-a scope-b",
        token_type: "Bearer",
      });

    const session = createManualLoginSession({
      clientId: "client-id",
      clientSecret: "client-secret",
      tokensPath,
      scopes: ["scope-a", "scope-b"],
      redirectUri: "http://127.0.0.1:53682/callback",
      state: "STATE",
    });

    expect(session.authUrl).toContain("https://accounts.google.com/o/oauth2");
    expect(session.authUrl).toContain("state=STATE");
    expect(session.authUrl).toContain("redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback");

    const tokens = await session.complete(
      "http://127.0.0.1:53682/callback?state=STATE&code=CODE_FROM_GOOGLE",
    );

    expect(tokens.access_token).toBe("AT");
    expect(tokens.refresh_token).toBe("RT");
    expect(JSON.parse(await readFile(tokensPath, "utf8")).refresh_token).toBe("RT");
    expect(tokenRequest.isDone()).toBe(true);
  });
});
