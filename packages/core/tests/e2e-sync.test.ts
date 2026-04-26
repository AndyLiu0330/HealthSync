import { google } from "googleapis";
import nock from "nock";
import { beforeEach, describe, expect, it } from "vitest";
import { DriveClient, HealthClient, runSync } from "../src/index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("E2E runSync with mocked Google APIs", () => {
  beforeEach(() => nock.cleanAll());

  it("fetches one day, uploads raw JSON + daily MD to Drive", async () => {
    // --- Google Health API
    const hc = nock("https://health.googleapis.com");
    hc.get("/v4/users/me/dataTypes/steps/dataPoints")
      .query(true)
      .reply(200, {
        dataPoints: [{ steps: { count: "8432" } }],
      });

    // --- Google Drive API
    const dc = nock("https://www.googleapis.com");
    // ensureFolderPath HealthSync → raw → 2026 → 04 (4 missing lookups + 4 creates)
    for (const name of ["HealthSync", "raw", "2026", "04"]) {
      dc.get("/drive/v3/files")
        .query((q) => typeof q.q === "string" && q.q.includes(name))
        .reply(200, { files: [] });
      dc.post("/drive/v3/files")
        .query(true)
        .reply(200, { id: `${name}-id`, name });
    }
    // ensureFolderPath daily → 2026 → 04 (4 missing lookups + 4 creates)
    for (const name of ["HealthSync", "daily", "2026", "04"]) {
      dc.get("/drive/v3/files")
        .query((q) => typeof q.q === "string" && q.q.includes(name))
        .reply(200, { files: [] });
      dc.post("/drive/v3/files")
        .query(true)
        .reply(200, { id: `${name}-id2`, name });
    }
    // raw JSON upload
    dc.post("/upload/drive/v3/files").query(true).reply(200, { id: "raw-file" });
    // daily MD upload
    dc.post("/upload/drive/v3/files").query(true).reply(200, { id: "md-file" });

    const auth = fakeAuth();
    const state: { lastSync: Record<string, string> } = { lastSync: {} };

    const result = await runSync({
      health: new HealthClient(auth),
      drive: new DriveClient(auth),
      state: {
        async get() {
          return state;
        },
        async setType(type, iso) {
          state.lastSync[type] = iso;
        },
      },
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-04-20T00:00:00Z"),
    });

    expect(result.perType.steps?.status).toBe("ok");
    expect(result.perType.steps?.rawFileId).toBe("raw-file");
    expect(result.dailyMarkdownFileId).toBe("md-file");
    expect(state.lastSync.steps).toBeDefined();
  });
});
