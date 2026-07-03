import type { CanonicalDay } from "../../json/index.js";

export function renderHeartRateVariabilitySection(day: CanonicalDay): string | null {
  const h = day.heartRateVariability;
  if (!h || typeof h.rmssdMs !== "number") return null;
  return ["## 📈 Heart Rate Variability", `- **RMSSD**: ${h.rmssdMs.toFixed(1)} ms`].join("\n");
}
