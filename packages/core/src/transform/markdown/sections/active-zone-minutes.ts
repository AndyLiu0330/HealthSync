import type { CanonicalDay } from "../../json/index.js";

export function renderActiveZoneMinutesSection(day: CanonicalDay): string | null {
  const a = day.activeZoneMinutes;
  if (!a) return null;
  const lines = ["## 🎯 Active Zone Minutes"];
  const total = typeof a.total === "number" ? a.total : 0;
  const parts: string[] = [];
  if (typeof a.fatBurn === "number") parts.push(`Fat Burn ${a.fatBurn}`);
  if (typeof a.cardio === "number") parts.push(`Cardio ${a.cardio}`);
  if (typeof a.peak === "number" && a.peak > 0) parts.push(`Peak ${a.peak}`);
  const suffix = parts.length ? ` (${parts.join(" · ")})` : "";
  lines.push(`- **Total**: ${total} min${suffix}`);
  return lines.join("\n");
}
