import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSyncState, saveSyncState, updateLastSync } from "./index.js";

async function tmpFile() {
  const dir = await mkdtemp(join(tmpdir(), "healthsync-state-"));
  return join(dir, "sync-state.json");
}

describe("sync state", () => {
  it("load returns empty state when file missing", async () => {
    const path = await tmpFile();
    const state = await loadSyncState(path);
    expect(state).toEqual({ lastSync: {} });
  });

  it("save then load round-trips", async () => {
    const path = await tmpFile();
    await saveSyncState(path, { lastSync: { steps: "2026-04-19T00:00:00.000Z" } });
    const state = await loadSyncState(path);
    expect(state.lastSync.steps).toBe("2026-04-19T00:00:00.000Z");
  });

  it("updateLastSync merges a type without touching others", async () => {
    const path = await tmpFile();
    await saveSyncState(path, {
      lastSync: { steps: "2026-04-18T00:00:00.000Z", sleep: "2026-04-17T00:00:00.000Z" },
    });
    await updateLastSync(path, "steps", "2026-04-19T00:00:00.000Z");
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.lastSync.steps).toBe("2026-04-19T00:00:00.000Z");
    expect(after.lastSync.sleep).toBe("2026-04-17T00:00:00.000Z");
  });
});
