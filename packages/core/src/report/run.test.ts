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
    uploadMarkdown: vi.fn(
      async (p: {
        parentId: string;
        name: string;
        body: string;
        overwriteFileId?: string;
      }) => {
        if (p.overwriteFileId) {
          bodies.set(p.overwriteFileId, p.body);
          return p.overwriteFileId;
        }
        const id = `md-${nextId++}`;
        folders.get(p.parentId)?.push({ id, name: p.name });
        bodies.set(id, p.body);
        return id;
      },
    ),
    uploadHTML: vi.fn(
      async (p: { parentId: string; name: string; body: string; overwriteFileId?: string }) => {
        uploadedHTML.push(p);
        return p.overwriteFileId ?? "dash-1";
      },
    ),
    findChild: vi.fn(async (parentId: string, name: string) => {
      const entry = folders.get(parentId)?.find((f) => f.name === name);
      return entry?.id ?? null;
    }),
    bodies,
    folders,
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

  it("skips a corrupt/unreadable raw file instead of aborting the run (renders as a gap)", async () => {
    const drive = makeDrive({
      "HealthSync/raw/2026/06": [
        rawSteps("2026-06-25", 100),
        rawSteps("2026-06-26", 200),
        rawSteps("2026-06-27", 300),
        rawSteps("2026-06-28", 400),
        rawSteps("2026-06-29", 500),
        rawSteps("2026-06-30", 600),
      ],
      "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 700)],
    });
    const originalDownload = drive.downloadJSON.getMockImplementation();
    drive.downloadJSON.mockImplementation(async (fileId: string) => {
      if (fileId === "seed-3") throw new Error("corrupt JSON");
      return originalDownload?.(fileId);
    });
    const result = await runDashboard({
      health: makeHealth(0),
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "week",
    });
    expect(result.syncedDates).toEqual([]);
    expect(result.errors).toEqual([]);
    // the corrupt day (2026-06-27) has no dot/title in the chart...
    expect(result.html).not.toContain("2026-06-27:");
    // ...but its neighbors are intact.
    expect(result.html).toContain("2026-06-26: 200");
    expect(result.html).toContain("2026-06-28: 400");
    expect((result.html.match(/class="chart-dot"/g) ?? []).length).toBe(6);
  });

  it("never rewinds the sync bookmark when backfilling older days", async () => {
    const drive = makeDrive({ "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 700)] });
    const setType = vi.fn(async () => {});
    const get = vi.fn(async () => ({ lastSync: { steps: "2026-07-02T00:00:00.000Z" } }));
    const result = await runDashboard({
      health: makeHealth(50),
      drive: drive as never,
      state: { get, setType },
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "week",
    });
    // 2026-06-25 .. 2026-06-30 are backfilled; all their setType(iso) writes are older
    // than (or equal to) the already-stored 2026-07-02T00:00:00.000Z bookmark, so none
    // should reach the underlying state port.
    expect(result.syncedDates).toEqual([
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
    ]);
    expect(setType).not.toHaveBeenCalled();
  });

  it("backfills only the missing types for a partially-synced date", async () => {
    const drive = makeDrive({ "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 500)] });
    const health = {
      fetch: vi.fn(
        async ({
          type,
          startTime,
          endTime,
        }: { type: string; startTime: string; endTime: string }) => ({
          type,
          startTime,
          endTime,
          points: [{ dailyRestingHeartRate: { beatsPerMinute: 55 } }],
        }),
      ),
    };
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps", "resting-heart-rate"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(health.fetch).toHaveBeenCalledTimes(1);
    expect(health.fetch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "resting-heart-rate" }),
    );
    expect(result.syncedDates).toEqual(["2026-07-01"]);
    expect(result.html).toContain("Resting heart rate");
    expect(result.html).toContain("500"); // steps read back from the seeded file
  });

  it("rebuilds one complete daily note instead of duplicating it when backfilling missing types", async () => {
    const drive = makeDrive({
      "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 500)],
      "HealthSync/daily/2026/07": [{ name: "2026-07-01.md", body: "# stale partial note" }],
    });
    const health = {
      fetch: vi.fn(
        async ({
          type,
          startTime,
          endTime,
        }: { type: string; startTime: string; endTime: string }) => ({
          type,
          startTime,
          endTime,
          points: [{ dailyRestingHeartRate: { beatsPerMinute: 55 } }],
        }),
      ),
    };
    await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps", "resting-heart-rate"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    const dailyListing = drive.folders.get("HealthSync/daily/2026/07") ?? [];
    const noteEntries = dailyListing.filter((f) => f.name === "2026-07-01.md");
    expect(noteEntries).toHaveLength(1);
    expect(noteEntries[0]?.id).toBe(dailyListing[0]?.id); // same id: overwrite, not a new sibling
    const body = drive.bodies.get(noteEntries[0]?.id ?? "") as string;
    expect(body).toContain("Steps");
    expect(body).toContain("Resting Heart Rate");
  });

  it("forwards a legitimate setType write to the underlying state port", async () => {
    const drive = makeDrive();
    const setType = vi.fn(async () => {});
    const get = vi.fn(async () => ({ lastSync: { steps: "2026-06-01T00:00:00.000Z" } }));
    await runDashboard({
      health: makeHealth(10),
      drive: drive as never,
      state: { get, setType },
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(setType).toHaveBeenCalledWith("steps", expect.any(String));
  });
});
