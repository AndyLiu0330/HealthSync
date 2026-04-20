import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTokens, saveTokens, type StoredTokens } from "./token-store.js";

async function tmpPath() {
  const dir = await mkdtemp(join(tmpdir(), "healthsync-tok-"));
  return join(dir, "tokens.json");
}

const sample: StoredTokens = {
  access_token: "AT",
  refresh_token: "RT",
  expires_at: "2026-04-19T12:00:00.000Z",
  scope: "https://www.googleapis.com/auth/drive.file",
};

describe("token store", () => {
  it("returns null when file missing", async () => {
    expect(await loadTokens(await tmpPath())).toBeNull();
  });

  it("saves with 0600 permissions and round-trips", async () => {
    const path = await tmpPath();
    await saveTokens(path, sample);
    const info = await stat(path);
    expect(info.mode & 0o777).toBe(0o600);
    const loaded = await loadTokens(path);
    expect(loaded).toEqual(sample);
  });

  it("overwrites atomically when saved twice", async () => {
    const path = await tmpPath();
    await saveTokens(path, sample);
    await saveTokens(path, { ...sample, access_token: "AT2" });
    const content = JSON.parse(await readFile(path, "utf8"));
    expect(content.access_token).toBe("AT2");
  });
});
