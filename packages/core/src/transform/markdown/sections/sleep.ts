import type { CanonicalDay } from "../../json/index.js";

export function renderSleepSection(day: CanonicalDay): string | null {
  const sl = day.sleep;
  if (!sl) return null;
  const lines = ["## 😴 Sleep"];
  if (typeof sl.durationMinutes === "number") {
    lines.push(`- **Duration**: ${durationLabel(sl.durationMinutes)}`);
  }
  const stages = sl.stages;
  if (stages) {
    const parts: string[] = [];
    if (typeof stages.deep === "number") parts.push(`Deep ${durationLabel(stages.deep)}`);
    if (typeof stages.rem === "number") parts.push(`REM ${durationLabel(stages.rem)}`);
    if (typeof stages.light === "number") parts.push(`Light ${durationLabel(stages.light)}`);
    if (typeof stages.awake === "number" && stages.awake > 0)
      parts.push(`Awake ${durationLabel(stages.awake)}`);
    if (parts.length) lines.push(`- **Stages**: ${parts.join(" · ")}`);
  }
  if (typeof sl.score === "number") lines.push(`- **Score**: ${sl.score} / 100`);
  return lines.join("\n");
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
