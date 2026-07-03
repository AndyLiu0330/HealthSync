import { describe, expect, it, vi } from "vitest";
import { runDashboard } from "./run.js";

type FileEntry = { id: string; name: string };

function makeDrive(seed: Record<string, Array<{ name: string; body: unknown }>> = {}) {
  const folders = new Map<string, FileEntry[]>();
  const bodies = new Map<string, unknown>();
  let nextId = 1;
  for (const [folder, files] of Object.entries(seed)) {
    const entries: FileEntry[] = [];
    for (const f of files) {
      const id = `seed-${nextId++}`;
      entries.push({ id, name: f.name });
      bodies.set(id, f.body);
    }
    folders.set(folder, entries);
  }
  const uploadedHTML: Array<{
    parentId: string;
    name: string;
    body: string;
    overwriteFileId?: string;
  }> = [];
  return {
    uploadedHTML,
    ensureFolderPath: vi.fn(async (segments: string[]) => {
      const key = segments.join("/");
      if (!folders.has(key)) folders.set(key, []);
      return key;
    }),
    listChildren: vi.fn(async (parentId: string) => folders.get(parentId) ?? []),
    downloadJSON: vi.fn(async (fileId: string) => bodies.get(fileId)),
    uploadJSON: vi.fn(async (p: { parentId: string; name: string; body: unknown }) => {
      const id = `up-${nextId++}`;
      folders.get(p.parentId)?.push({ id, name: p.name });
      bodies.set(id, p.body);
      return id;
    }),
    uploadMarkdown: vi.fn(async () => `md-${nextId++}`),
    uploadHTML: vi.fn(
      async (p: { parentId: string; name: string; body: string; overwriteFileId?: string }) => {
        uploadedHTML.push(p);
        return p.overwriteFileId ?? "dash-1";
      },
    ),
    findChild: vi.fn(async () => null),
  };
}

function makeHealth(stepsPerDay: number) {
  return {
    fetch: vi.fn(
      async ({
        type,
        startTime,
        endTime,
      }: { type: string; startTime: string; endTime: string }) => ({
        type,
        startTime,
        endTime,
        points: [{ steps: { count: stepsPerDay } }],
      }),
    ),
  };
}

const state = () => ({
  get: vi.fn(async () => ({ lastSync: {} })),
  setType: vi.fn(async () => {}),
});

function rawSteps(date: string, count: number) {
  return {
    name: `${date}_steps.json`,
    body: {
      type: "steps",
      startTime: `${date}T00:00:00.000Z`,
      endTime: `${date}T23:59:59.000Z`,
      points: [{ steps: { count } }],
    },
  };
}

describe("runDashboard", () => {
  it("day range with empty Drive: syncs yesterday, reads it back, uploads dashboard.html", async () => {
    const drive = makeDrive();
    const health = makeHealth(4321);
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(result.dates).toEqual(["2026-07-01"]);
    expect(result.syncedDates).toEqual(["2026-07-01"]);
    expect(result.errors).toEqual([]);
    expect(health.fetch).toHaveBeenCalledTimes(1);
    expect(result.html).toContain("4,321");
    expect(drive.uploadedHTML[0]?.parentId).toBe("HealthSync");
    expect(drive.uploadedHTML[0]?.name).toBe("dashboard.html");
    expect(result.driveFileId).toBe("dash-1");
  });

  it("skips days that already have raw files (no duplicate sync)", async () => {
    const drive = makeDrive({
      "HealthSync/raw/2026/06": [rawSteps("2026-06-30", 1000)],
      "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 2000)],
    });
    const health = makeHealth(0);
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "week",
    });
    expect(result.dates).toHaveLength(7);
    expect(result.dates[0]).toBe("2026-06-25");
    expect(result.dates[6]).toBe("2026-07-01");
    // 5 of 7 days missing -> 5 sync fetches; the 2 seeded days are not re-synced
    expect(result.syncedDates).toHaveLength(5);
    expect(result.syncedDates).not.toContain("2026-06-30");
    expect(result.syncedDates).not.toContain("2026-07-01");
    expect(result.html).toContain("<svg");
  });

  it("overwrites an existing dashboard.html instead of duplicating it", async () => {
    const drive = makeDrive({ "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 500)] });
    drive.findChild.mockResolvedValue("dash-old");
    const result = await runDashboard({
      health: makeHealth(0),
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(drive.uploadedHTML[0]?.overwriteFileId).toBe("dash-old");
    expect(result.driveFileId).toBe("dash-old");
  });

  it("collects per-type sync errors without aborting", async () => {
    const drive = makeDrive();
    const health = {
      fetch: vi.fn(
        async ({
          type,
          startTime,
          endTime,
        }: { type: string; startTime: string; endTime: string }) => {
          if (type === "sleep") throw new Error("boom");
          return { type, startTime, endTime, points: [{ steps: { count: 1 } }] };
        },
      ),
    };
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps", "sleep"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(result.errors).toEqual([{ date: "2026-07-01", type: "sleep", error: "boom" }]);
    expect(result.html).toContain("Steps");
  });
});
