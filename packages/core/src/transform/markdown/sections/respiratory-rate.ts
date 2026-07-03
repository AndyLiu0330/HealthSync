import type { CanonicalDay } from "../../json/index.js";

export function renderRespiratoryRateSection(day: CanonicalDay): string | null {
  const r = day.respiratoryRate;
  if (!r || typeof r.breathsPerMinute !== "number") return null;
  return [
    "## 🌬️ Respiratory Rate",
    `- **Breaths per minute**: ${r.breathsPerMinute.toFixed(1)}`,
  ].join("\n");
}
