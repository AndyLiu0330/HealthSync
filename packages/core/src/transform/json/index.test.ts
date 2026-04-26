import { describe, expect, it } from "vitest";
import { type CanonicalDay, toCanonical } from "./index.js";

describe("toCanonical", () => {
  it("pulls the date-level summary for steps", () => {
    const canonical = toCanonical({
      type: "steps",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ date: "2026-04-19", value: 8432, goal: 10000, distanceMeters: 6100 }],
    });
    expect(canonical.date).toBe("2026-04-19");
    expect(canonical.steps).toEqual({ total: 8432, goal: 10000, distanceMeters: 6100 });
  });

  it("returns CanonicalDay with date only when no points", () => {
    const canonical: CanonicalDay = toCanonical({
      type: "sleep",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [],
    });
    expect(canonical).toEqual({ date: "2026-04-19" });
  });

  it("captures heart-rate resting/avg/max", () => {
    const c = toCanonical({
      type: "heart-rate",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ date: "2026-04-19", resting: 62, average: 78, max: 142 }],
    });
    expect(c.heartRate).toEqual({ resting: 62, average: 78, max: 142 });
  });

  it("summarizes v4 steps intervals", () => {
    const c = toCanonical({
      type: "steps",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ steps: { count: "6000" } }, { steps: { count: "2432" } }],
    });
    expect(c.steps).toEqual({ total: 8432 });
  });

  it("summarizes v4 heart-rate samples", () => {
    const c = toCanonical({
      type: "heart-rate",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [
        { heartRate: { beatsPerMinute: "62" } },
        { heartRate: { beatsPerMinute: "90" } },
        { heartRate: { beatsPerMinute: "82" } },
      ],
    });
    expect(c.heartRate).toEqual({ average: 78, max: 90 });
  });

  it("summarizes v4 sleep sessions", () => {
    const c = toCanonical({
      type: "sleep",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [
        {
          sleep: {
            summary: {
              minutesAsleep: "420",
              stagesSummary: [
                { type: "DEEP", minutes: "70" },
                { type: "REM", minutes: "95" },
                { type: "LIGHT", minutes: "255" },
                { type: "AWAKE", minutes: "30" },
              ],
            },
          },
        },
      ],
    });
    expect(c.sleep).toEqual({
      durationMinutes: 420,
      stages: { awake: 30, deep: 70, light: 255, rem: 95 },
    });
  });

  it("summarizes v4 active zone minutes by zone", () => {
    const c = toCanonical({
      type: "active-zone-minutes",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [
        { activeZoneMinutes: { activeZoneMinutes: "10", heartRateZone: "FAT_BURN" } },
        { activeZoneMinutes: { activeZoneMinutes: "8", heartRateZone: "CARDIO" } },
        { activeZoneMinutes: { activeZoneMinutes: "4", heartRateZone: "PEAK" } },
      ],
    });
    expect(c.activeZoneMinutes).toEqual({ cardio: 8, fatBurn: 10, peak: 4, total: 22 });
  });

  it("summarizes v4 daily oxygen saturation", () => {
    const c = toCanonical({
      type: "spo2",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ dailyOxygenSaturation: { averagePercentage: 96.4 } }],
    });
    expect(c.spo2).toEqual({ averageOvernight: 96.4 });
  });
});
