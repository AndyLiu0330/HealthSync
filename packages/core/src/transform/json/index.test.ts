import { describe, expect, it } from "vitest";
import { toCanonical, type CanonicalDay } from "./index.js";

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
});
