import { describe, expect, it } from "vitest";
import { renderDashboard } from "./render.js";

function day(date: string, steps?: number) {
  return { date, ...(steps === undefined ? {} : { steps: { total: steps } }) };
}

const GEN = "2026-07-02T00:00:00.000Z";

describe("renderDashboard", () => {
  it("sums steps into a tile and renders a chart", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 1000), day("2026-06-26", 2500)],
      generatedAt: GEN,
      types: ["steps"],
    });
    expect(html).toContain("3,500");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Heart rate"); // type not enabled -> not rendered
    expect(html).toContain("2026-06-25 – 2026-06-26");
  });

  it("always renders enabled metrics: dash tile + no-data chart placeholder", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 1000), day("2026-06-26", 2500)],
      generatedAt: GEN,
      types: ["steps", "resting-heart-rate"],
    });
    expect(html).toContain("Resting heart rate");
    expect(html).toContain("—");
    expect(html).toContain("No data in this range");
    expect(html.match(/<svg/g)).toHaveLength(1); // only steps has a real chart
  });

  it("renders a true zero as 0, not a dash", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 0), day("2026-06-26", 0)],
      generatedAt: GEN,
      types: ["steps"],
    });
    expect(html).toContain(">0<");
    expect(html).not.toContain("—");
  });

  it("renders the new metrics from canonical fields", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        {
          date: "2026-06-25",
          calories: { total: 2100 },
          restingHeartRate: { bpm: 55 },
          heartRateVariability: { rmssdMs: 48.5 },
          respiratoryRate: { breathsPerMinute: 14.2 },
        },
        { date: "2026-06-26" },
      ],
      generatedAt: GEN,
      types: ["calories", "resting-heart-rate", "heart-rate-variability", "respiratory-rate"],
    });
    expect(html).toContain("Calories");
    expect(html).toContain("2,100");
    expect(html).toContain("55");
    expect(html).toContain("48.5");
    expect(html).toContain("14.2");
  });

  it("breaks the line at missing days instead of bridging the gap", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        day("2026-06-25", 1000),
        day("2026-06-26"),
        day("2026-06-27", 3000),
        day("2026-06-28", 2000),
      ],
      generatedAt: GEN,
      types: ["steps"],
    });
    expect(html.match(/<polyline/g)).toHaveLength(1);
    expect(html.match(/<circle/g)).toHaveLength(3);
  });

  it("day range renders tiles only, no chart and no placeholder", () => {
    const html = renderDashboard({
      range: "day",
      days: [day("2026-07-01", 4321)],
      generatedAt: GEN,
      types: ["steps", "sleep"],
    });
    expect(html).toContain("4,321");
    expect(html).toContain("Sleep");
    expect(html).toContain("—"); // sleep has no data -> dash tile
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("No data in this range");
  });
});
