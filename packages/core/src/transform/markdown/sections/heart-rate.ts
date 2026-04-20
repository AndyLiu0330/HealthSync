import type { CanonicalDay } from "../../json/index.js";

export function renderHeartRateSection(day: CanonicalDay): string | null {
  const hr = day.heartRate;
  if (!hr) return null;
  const lines = ["## ❤️ Heart Rate"];
  if (typeof hr.resting === "number") lines.push(`- **Resting**: ${hr.resting} bpm`);
  if (typeof hr.average === "number") lines.push(`- **Average**: ${hr.average} bpm`);
  if (typeof hr.max === "number") lines.push(`- **Max**: ${hr.max} bpm`);
  return lines.join("\n");
}
