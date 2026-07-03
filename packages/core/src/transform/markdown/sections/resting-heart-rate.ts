import type { CanonicalDay } from "../../json/index.js";

export function renderRestingHeartRateSection(day: CanonicalDay): string | null {
  const r = day.restingHeartRate;
  if (!r || typeof r.bpm !== "number") return null;
  return ["## 💓 Resting Heart Rate", `- **Resting HR**: ${r.bpm} bpm`].join("\n");
}
