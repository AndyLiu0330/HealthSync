import { google } from "googleapis";
import nock from "nock";
import { beforeEach, describe, expect, it } from "vitest";
import { DriveClient } from "./index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("DriveClient", () => {
  beforeEach(() => nock.cleanAll());

  it("ensureFolderPath creates missing folders and returns the leaf id", async () => {
    const api = nock("https://www.googleapis.com");

    // Root lookup: "HealthSync" — not found.
    api
      .get("/drive/v3/files")
      .query((q) => q.q?.includes("'root' in parents") && q.q?.includes("HealthSync"))
      .reply(200, { files: [] });
    // Create "HealthSync" under root.
    api.post("/drive/v3/files").query(true).reply(200, { id: "root-id", name: "HealthSync" });
    // "raw" lookup under "root-id" — not found.
    api
      .get("/drive/v3/files")
      .query((q) => q.q?.includes("'root-id' in parents") && q.q?.includes("raw"))
      .reply(200, { files: [] });
    api.post("/drive/v3/files").query(true).reply(200, { id: "raw-id", name: "raw" });

    const client = new DriveClient(fakeAuth());
    const id = await client.ensureFolderPath(["HealthSync", "raw"]);
    expect(id).toBe("raw-id");
  });

  it("uploadJSON writes multipart body and returns the file id", async () => {
    const api = nock("https://www.googleapis.com");
    api
      .post("/upload/drive/v3/files")
      .query((q) => q.uploadType === "multipart")
      .reply(200, { id: "file-1", name: "sample.json" });

    const client = new DriveClient(fakeAuth());
    const id = await client.uploadJSON({
      parentId: "raw-id",
      name: "sample.json",
      body: { foo: 1 },
    });
    expect(id).toBe("file-1");
  });

  it("uploadJSON with overwriteFileId sends update and returns the same id", async () => {
    const api = nock("https://www.googleapis.com");
    api.patch("/upload/drive/v3/files/file-1").query(true).reply(200, { id: "file-1" });

    const client = new DriveClient(fakeAuth());
    const id = await client.uploadJSON({
      parentId: "raw-id",
      name: "sample.json",
      body: { foo: 1 },
      overwriteFileId: "file-1",
    });
    expect(id).toBe("file-1");
  });
});
