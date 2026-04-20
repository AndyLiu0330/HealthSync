import { describe, expect, it } from "vitest";
import { renderDailyNote } from "./index.js";

describe("renderDailyNote", () => {
  it("renders front matter + sections for populated day", () => {
    const md = renderDailyNote({
      date: "2026-04-19",
      steps: { total: 8432, goal: 10000, distanceMeters: 6100, activeMinutes: 47 },
      heartRate: { resting: 62, average: 78, max: 142 },
      sleep: {
        durationMinutes: 443,
        score: 84,
        stages: { deep: 72, rem: 105, light: 266, awake: 0 },
      },
      activeZoneMinutes: { total: 32, fatBurn: 22, cardio: 10, peak: 0 },
      spo2: { averageOvernight: 96.8 },
    });

    expect(md).toMatch(/^---\n/);
    expect(md).toContain("date: 2026-04-19");
    expect(md).toContain("types: [steps, heart-rate, sleep, active-zone-minutes, spo2]");
    expect(md).toContain("# 2026-04-19 Health Summary");
    expect(md).toContain("🚶 Steps");
    expect(md).toContain("**Total**: 8,432 / 10,000 (84%)");
    expect(md).toContain("❤️ Heart Rate");
    expect(md).toContain("**Resting**: 62 bpm");
    expect(md).toContain("😴 Sleep");
    expect(md).toContain("**Duration**: 7h 23m");
    expect(md).toContain("🎯 Active Zone Minutes");
    expect(md).toContain("🫁 SpO2");
    expect(md).toContain("[[2026-04-18]]");
    expect(md).toContain("[[2026-04-20]]");
    expect(md).toContain("[steps](../../raw/2026/04/2026-04-19_steps.json)");
    expect(md).toContain("[sleep](../../raw/2026/04/2026-04-19_sleep.json)");
  });

  it("omits sections with no data and excludes them from front-matter types", () => {
    const md = renderDailyNote({
      date: "2026-04-19",
      steps: { total: 8432 },
    });
    expect(md).toContain("types: [steps]");
    expect(md).toContain("🚶 Steps");
    expect(md).not.toContain("😴 Sleep");
    expect(md).not.toContain("🫁 SpO2");
  });
});
