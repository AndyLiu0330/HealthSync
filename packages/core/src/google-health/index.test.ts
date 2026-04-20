import { beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { google } from "googleapis";
import { HealthClient } from "./index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("HealthClient.fetch", () => {
  beforeEach(() => nock.cleanAll());

  it("returns points for a given range", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v1/users/me/steps/read")
      .query(true)
      .reply(200, { points: [{ date: "2026-04-19", value: 8432 }] });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "steps",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
    });
    expect(result.type).toBe("steps");
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toEqual({ date: "2026-04-19", value: 8432 });
  });

  it("retries on 429 with Retry-After honored then succeeds", async () => {
    const api = nock("https://health.googleapis.com");
    api.get("/v1/users/me/sleep/read").query(true).reply(429, {}, { "Retry-After": "0" });
    api.get("/v1/users/me/sleep/read").query(true).reply(200, { points: [] });

    const client = new HealthClient(fakeAuth(), { maxRetries: 3, baseDelayMs: 1 });
    const result = await client.fetch({
      type: "sleep",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
    });
    expect(result.points).toEqual([]);
  });

  it("throws NetworkError after exhausting retries", async () => {
    const api = nock("https://health.googleapis.com");
    api.get("/v1/users/me/spo2/read").query(true).times(4).reply(500, {});

    const client = new HealthClient(fakeAuth(), { maxRetries: 3, baseDelayMs: 1 });
    await expect(
      client.fetch({
        type: "spo2",
        startTime: "2026-04-19T00:00:00.000Z",
        endTime: "2026-04-20T00:00:00.000Z",
      }),
    ).rejects.toThrow(/Health API/i);
  });
});
