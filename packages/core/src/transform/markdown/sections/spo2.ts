import type { CanonicalDay } from "../../json/index.js";

export function renderSpo2Section(day: CanonicalDay): string | null {
  const s = day.spo2;
  if (!s || typeof s.averageOvernight !== "number") return null;
  return ["## 🫁 SpO2", `- **Average overnight**: ${s.averageOvernight.toFixed(1)}%`].join("\n");
}
