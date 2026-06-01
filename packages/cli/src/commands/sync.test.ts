import type { RunSyncParams, RunSyncResult } from "@healthsync/core";
import { describe, expect, it, vi } from "vitest";
import { buildSyncCommand } from "./sync.js";

describe("sync command", () => {
  it("passes parsed flags to runSync and prints JSON output when --json", async () => {
    const runSync = vi.fn(
      async (_p: RunSyncParams): Promise<RunSyncResult> => ({
        date: "2026-04-19",
        perType: { steps: { type: "steps", status: "ok", rawFileId: "f1" } },
        dailyMarkdownFileId: "md1",
      }),
    );
    const out: string[] = [];
    const cmd = buildSyncCommand({
      buildDeps: async () => ({
        health: { fetch: vi.fn() } as never,
        drive: {} as never,
        state: {} as never,
        driveRoot: "HealthSync",
        types: ["steps", "heart-rate", "sleep", "active-zone-minutes", "spo2"],
      }),
      runSync,
      writeLine: (s) => out.push(s),
      now: () => new Date("2026-04-20T00:00:00Z"),
    });
    await cmd.parseAsync([
      "node",
      "healthsync",
      "--types",
      "steps",
      "--since",
      "2026-04-19T00:00:00.000Z",
      "--force",
      "--json",
    ]);
    expect(runSync).toHaveBeenCalledTimes(1);
    const arg = runSync.mock.calls[0]?.[0];
    expect(arg?.types).toEqual(["steps"]);
    expect(arg?.since).toBe("2026-04-19T00:00:00.000Z");
    expect(arg?.force).toBe(true);
    const last = JSON.parse(out[out.length - 1] ?? "{}");
    expect(last.date).toBe("2026-04-19");
    expect(last.perType.steps.status).toBe("ok");
  });
});
