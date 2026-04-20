import type { CanonicalDay } from "../json/index.js";
import { renderActiveZoneMinutesSection } from "./sections/active-zone-minutes.js";
import { renderHeartRateSection } from "./sections/heart-rate.js";
import { renderSleepSection } from "./sections/sleep.js";
import { renderSpo2Section } from "./sections/spo2.js";
import { renderStepsSection } from "./sections/steps.js";

const ORDER = [
  { key: "steps", render: renderStepsSection },
  { key: "heart-rate", render: renderHeartRateSection },
  { key: "sleep", render: renderSleepSection },
  { key: "active-zone-minutes", render: renderActiveZoneMinutesSection },
  { key: "spo2", render: renderSpo2Section },
] as const;

export function renderDailyNote(day: CanonicalDay): string {
  const sections: Array<{ key: string; body: string }> = [];
  for (const entry of ORDER) {
    const body = entry.render(day);
    if (body) sections.push({ key: entry.key, body });
  }

  const types = sections.map((s) => s.key).join(", ");
  const { prev, next } = adjacentDates(day.date);

  const lines: string[] = [];
  lines.push("---");
  lines.push(`date: ${day.date}`);
  lines.push("source: healthsync");
  lines.push("tags: [health, daily, pixel-watch]");
  lines.push(`types: [${types}]`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${day.date} Health Summary`);
  lines.push("");
  for (const s of sections) {
    lines.push(s.body);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## 🔗 Links");
  const rawLinks = sections
    .map((s) => `[[../../raw/${pathParts(day.date)}_${s.key}.json|${s.key}]]`)
    .join(" · ");
  lines.push(`- Raw JSON: ${rawLinks}`);
  lines.push(`- Previous: [[${prev}]] · Next: [[${next}]]`);
  lines.push("");
  return lines.join("\n");
}

function adjacentDates(date: string): { prev: string; next: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const p = new Date(d);
  p.setUTCDate(p.getUTCDate() - 1);
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + 1);
  return {
    prev: p.toISOString().slice(0, 10),
    next: n.toISOString().slice(0, 10),
  };
}

function pathParts(date: string): string {
  const [y, m, _d] = date.split("-");
  return `${y}/${m}/${date}`;
}
