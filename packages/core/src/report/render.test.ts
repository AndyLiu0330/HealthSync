import { describe, expect, it } from "vitest";
import { renderDashboard } from "./render.js";

function day(date: string, steps?: number) {
  return { date, ...(steps === undefined ? {} : { steps: { total: steps } }) };
}

describe("renderDashboard", () => {
  it("sums steps across the range into a tile and renders a chart", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 1000), day("2026-06-26", 2500)],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("3,500");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Heart rate"); // metric with no data is omitted
    expect(html).toContain("2026-06-25 – 2026-06-26"); // range in title
  });

  it("averages avg-type metrics", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        { date: "2026-06-25", heartRate: { average: 60 } },
        { date: "2026-06-26", heartRate: { average: 70 } },
      ],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("Heart rate");
    expect(html).toContain("65");
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
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    // lone point before the gap -> no polyline; the pair after -> exactly one
    expect(html.match(/<polyline/g)).toHaveLength(1);
    expect(html.match(/<circle/g)).toHaveLength(3);
  });

  it("day range renders tiles only, no chart", () => {
    const html = renderDashboard({
      range: "day",
      days: [day("2026-07-01", 4321)],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("4,321");
    expect(html).not.toContain("<svg");
  });

  it("renders an empty state when no metric has data", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25"), day("2026-06-26")],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("No health data found");
  });
});
