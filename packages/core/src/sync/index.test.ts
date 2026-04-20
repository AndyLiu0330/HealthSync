import { describe, expect, it, vi } from "vitest";
import { runSync } from "./index.js";

function makeHealthStub() {
  return {
    fetch: vi.fn(async ({ type }: { type: string }) => ({
      type,
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ date: "2026-04-19", value: 8432, goal: 10000 }],
    })),
  };
}

function makeDriveStub() {
  const calls: Array<{ method: string; args: unknown }> = [];
  return {
    calls,
    ensureFolderPath: vi.fn(async () => "folder-id"),
    uploadJSON: vi.fn(async (p: { name: string }) => {
      calls.push({ method: "uploadJSON", args: p });
      return `json-${p.name}`;
    }),
    uploadMarkdown: vi.fn(async (p: { name: string }) => {
      calls.push({ method: "uploadMarkdown", args: p });
      return `md-${p.name}`;
    }),
    listChildren: vi.fn(async () => []),
  };
}

describe("runSync", () => {
  it("fetches each configured type, uploads raw JSON + one daily MD", async () => {
    const state = {
      get: vi.fn(async () => ({ lastSync: {} })),
      setType: vi.fn(async () => {}),
    };
    const result = await runSync({
      health: makeHealthStub(),
      drive: makeDriveStub(),
      state,
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-04-20T00:00:00Z"),
    });
    expect(result.perType.steps?.status).toBe("ok");
    expect(result.perType.steps?.rawFileId).toMatch(/json-2026-04-19_steps\.json/);
    expect(result.dailyMarkdownFileId).toMatch(/md-2026-04-19\.md/);
    expect(state.setType).toHaveBeenCalledWith("steps", expect.any(String));
  });

  it("one failing type does not block others; state only advances on success", async () => {
    const health = {
      fetch: vi.fn(async ({ type }: { type: string }) => {
        if (type === "sleep") throw new Error("boom");
        return {
          type,
          startTime: "2026-04-19T00:00:00.000Z",
          endTime: "2026-04-20T00:00:00.000Z",
          points: [{ date: "2026-04-19", value: 1 }],
        };
      }),
    };
    const state = {
      get: vi.fn(async () => ({ lastSync: {} })),
      setType: vi.fn(async () => {}),
    };
    const result = await runSync({
      health,
      drive: makeDriveStub(),
      state,
      types: ["steps", "sleep"],
      driveRoot: "HealthSync",
      now: new Date("2026-04-20T00:00:00Z"),
    });
    expect(result.perType.steps?.status).toBe("ok");
    expect(result.perType.sleep?.status).toBe("error");
    expect(state.setType).toHaveBeenCalledWith("steps", expect.any(String));
    expect(state.setType).not.toHaveBeenCalledWith("sleep", expect.anything());
  });
});
