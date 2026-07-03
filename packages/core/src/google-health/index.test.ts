import { google } from "googleapis";
import nock from "nock";
import { beforeEach, describe, expect, it } from "vitest";
import { HealthClient } from "./index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("HealthClient.fetch", () => {
  beforeEach(() => nock.cleanAll());

  it("lists v4 data points for a given range and follows pagination", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v4/users/me/dataTypes/steps/dataPoints")
      .query((q) => {
        expect(q.pageSize).toBe("10000");
        expect(q.filter).toBe(
          'steps.interval.start_time >= "2026-04-19T00:00:00.000Z" AND steps.interval.start_time < "2026-04-20T00:00:00.000Z"',
        );
        return true;
      })
      .reply(200, {
        dataPoints: [{ steps: { count: "6000" } }],
        nextPageToken: "next",
      });
    api
      .get("/v4/users/me/dataTypes/steps/dataPoints")
      .query((q) => q.pageToken === "next")
      .reply(200, {
        dataPoints: [{ steps: { count: "2432" } }],
      });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "steps",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
    });
    expect(result.type).toBe("steps");
    expect(result.points).toEqual([{ steps: { count: "6000" } }, { steps: { count: "2432" } }]);
  });

  it("retries on 429 with Retry-After honored then succeeds", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v4/users/me/dataTypes/sleep/dataPoints")
      .query((q) => {
        expect(q.pageSize).toBe("25");
        expect(q.filter).toBe(
          'sleep.interval.end_time >= "2026-04-19T00:00:00.000Z" AND sleep.interval.end_time < "2026-04-20T00:00:00.000Z"',
        );
        return true;
      })
      .reply(429, {}, { "Retry-After": "0" });
    api.get("/v4/users/me/dataTypes/sleep/dataPoints").query(true).reply(200, { dataPoints: [] });

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
    api
      .get("/v4/users/me/dataTypes/daily-oxygen-saturation/dataPoints")
      .query((q) => {
        expect(q.filter).toBe(
          'daily_oxygen_saturation.date >= "2026-04-19" AND daily_oxygen_saturation.date < "2026-04-20"',
        );
        return true;
      })
      .times(4)
      .reply(500, {});

    const client = new HealthClient(fakeAuth(), { maxRetries: 3, baseDelayMs: 1 });
    await expect(
      client.fetch({
        type: "spo2",
        startTime: "2026-04-19T00:00:00.000Z",
        endTime: "2026-04-20T00:00:00.000Z",
      }),
    ).rejects.toThrow(/Health API/i);
  });

  it("builds a daily-date filter for resting heart rate", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints")
      .query((q) => {
        expect(q.filter).toBe(
          'daily_resting_heart_rate.date >= "2026-07-01" AND daily_resting_heart_rate.date < "2026-07-02"',
        );
        return true;
      })
      .reply(200, { dataPoints: [{ dailyRestingHeartRate: { beatsPerMinute: "55" } }] });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "resting-heart-rate",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
    });
    expect(result.points).toEqual([{ dailyRestingHeartRate: { beatsPerMinute: "55" } }]);
  });

  it("uses dailyRollUp for calories and normalizes rollup data points", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .post("/v4/users/me/dataTypes/total-calories/dataPoints:dailyRollUp", (body) => {
        expect(body).toEqual({
          range: {
            start: { date: { year: 2026, month: 7, day: 1 } },
            end: { date: { year: 2026, month: 7, day: 2 } },
          },
          pageSize: 1,
        });
        return true;
      })
      .reply(200, {
        rollupDataPoints: [{ totalCalories: { kcalSum: 2100 } }],
      });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "calories",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
    });
    expect(result.points).toEqual([{ totalCalories: { kcalSum: 2100 } }]);
  });
});
