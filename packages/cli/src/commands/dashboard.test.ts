import { describe, expect, it, vi } from "vitest";
import { buildDashboardCommand } from "./dashboard.js";

function makeDeps() {
  const out: string[] = [];
  const result = {
    dates: ["2026-06-25", "2026-07-01"],
    syncedDates: ["2026-07-01"],
    errors: [{ date: "2026-07-01", type: "sleep", error: "boom" }],
    html: "<!doctype html><html></html>",
    driveFileId: "dash-1",
  };
  return {
    out,
    runDashboard: vi.fn(async () => result),
    deps: {
      buildDeps: vi.fn(async () => ({
        health: {} as never,
        drive: {} as never,
        state: {} as never,
        driveRoot: "HealthSync",
        types: ["steps"] as never,
      })),
      saveLocal: vi.fn(async () => "/home/u/.config/healthsync/dashboard.html"),
      openBrowser: vi.fn(async () => {}),
      writeLine: (s: string) => out.push(s),
      now: () => new Date("2026-07-02T10:00:00Z"),
    },
  };
}

describe("dashboard command", () => {
  it("runs the range, saves locally, opens the browser, reports errors", async () => {
    const { out, runDashboard, deps } = makeDeps();
    const cmd = buildDashboardCommand({ ...deps, runDashboard });
    await cmd.parseAsync(["node", "healthsync", "--range", "day"]);

    expect(runDashboard).toHaveBeenCalledWith(expect.objectContaining({ range: "day" }));
    expect(deps.saveLocal).toHaveBeenCalledWith("<!doctype html><html></html>");
    expect(deps.openBrowser).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/.*dashboard\.html$/),
    );
    expect(out.join("\n")).toContain("2026-06-25 .. 2026-07-01");
    expect(out.join("\n")).toContain("sleep");
  });

  it("defaults to week", async () => {
    const { runDashboard, deps } = makeDeps();
    const cmd = buildDashboardCommand({ ...deps, runDashboard });
    await cmd.parseAsync(["node", "healthsync"]);
    expect(runDashboard).toHaveBeenCalledWith(expect.objectContaining({ range: "week" }));
  });
});
