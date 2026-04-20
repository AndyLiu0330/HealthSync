import type { CanonicalDay } from "../../json/index.js";

export function renderStepsSection(day: CanonicalDay): string | null {
  const s = day.steps;
  if (!s) return null;
  const lines = ["## 🚶 Steps"];
  if (typeof s.goal === "number" && s.goal > 0) {
    const pct = Math.round((s.total / s.goal) * 100);
    lines.push(`- **Total**: ${fmt(s.total)} / ${fmt(s.goal)} (${pct}%)`);
  } else {
    lines.push(`- **Total**: ${fmt(s.total)}`);
  }
  if (typeof s.distanceMeters === "number") {
    lines.push(`- **Distance**: ${(s.distanceMeters / 1000).toFixed(1)} km`);
  }
  if (typeof s.activeMinutes === "number") {
    lines.push(`- **Active minutes**: ${s.activeMinutes}`);
  }
  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
