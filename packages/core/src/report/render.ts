import type { CanonicalDay } from "../transform/json/index.js";

export type DashboardRange = "day" | "week" | "month";

export interface RenderDashboardParams {
  range: DashboardRange;
  days: CanonicalDay[]; // one entry per date in range, ascending
  generatedAt: string; // ISO 8601
}

interface MetricSpec {
  label: string;
  unit: string;
  agg: "sum" | "avg";
  decimals: number;
  extract: (d: CanonicalDay) => number | undefined;
}

const METRICS: MetricSpec[] = [
  { label: "Steps", unit: "", agg: "sum", decimals: 0, extract: (d) => d.steps?.total },
  {
    label: "Heart rate",
    unit: "bpm",
    agg: "avg",
    decimals: 0,
    extract: (d) => d.heartRate?.average ?? d.heartRate?.resting,
  },
  {
    label: "Sleep",
    unit: "h",
    agg: "avg",
    decimals: 1,
    extract: (d) =>
      d.sleep?.durationMinutes === undefined ? undefined : d.sleep.durationMinutes / 60,
  },
  {
    label: "Active zone minutes",
    unit: "min",
    agg: "sum",
    decimals: 0,
    extract: (d) => d.activeZoneMinutes?.total,
  },
  { label: "SpO2", unit: "%", agg: "avg", decimals: 1, extract: (d) => d.spo2?.averageOvernight },
];

const STYLE = `
:root{--surface-1:#fcfcfb;--page:#f9f9f7;--ink:#0b0b0b;--ink-2:#52514e;--muted:#898781;
--grid:#e1e0d9;--border:rgba(11,11,11,0.10);--series:#2a78d6}
@media (prefers-color-scheme: dark){
:root{--surface-1:#1a1a19;--page:#0d0d0d;--ink:#ffffff;--ink-2:#c3c2b7;--muted:#898781;
--grid:#2c2c2a;--border:rgba(255,255,255,0.10);--series:#3987e5}}
body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--page);
color:var(--ink);max-width:760px;margin:2rem auto;padding:0 1rem}
h1{font-size:1.35rem;margin:0}
.meta{color:var(--ink-2);font-size:.85rem;margin:.25rem 0 1.25rem}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem}
.tile{background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem}
.tile .label{font-size:.8rem;color:var(--ink-2)}
.tile .value{font-size:1.6rem;font-weight:600}
.tile .unit{font-size:.85rem;font-weight:400;color:var(--muted);margin-left:.3rem}
section h2{font-size:1rem;margin:1.5rem 0 .4rem}
svg{display:block;width:100%;height:auto;background:var(--surface-1);
border:1px solid var(--border);border-radius:8px}
.chart-line{fill:none;stroke:var(--series);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.chart-dot{fill:var(--series);stroke:var(--surface-1);stroke-width:2}
.chart-grid{stroke:var(--grid);stroke-width:1}
.chart-text{font:11px system-ui,sans-serif;fill:var(--muted)}
`;

export function renderDashboard(p: RenderDashboardParams): string {
  const first = p.days[0]?.date ?? "";
  const last = p.days[p.days.length - 1]?.date ?? "";
  const rangeLabel = p.range === "day" ? last : `${first} – ${last}`;

  const tiles: string[] = [];
  const charts: string[] = [];
  for (const m of METRICS) {
    const values = p.days.map((d) => m.extract(d));
    const present = values.filter((v): v is number => v !== undefined);
    if (present.length === 0) continue;
    const total = present.reduce((a, b) => a + b, 0);
    const value = m.agg === "sum" ? total : total / present.length;
    const suffix = m.agg === "avg" && p.range !== "day" ? " (avg)" : "";
    const unit = m.unit ? `<span class="unit">${m.unit}</span>` : "";
    tiles.push(
      `<div class="tile"><div class="label">${m.label}${suffix}</div><div class="value">${fmt(value, m.decimals)}${unit}</div></div>`,
    );
    if (p.days.length > 1) {
      const chart = lineChart(
        values,
        p.days.map((d) => d.date),
        m.decimals,
      );
      const title = m.unit ? `${m.label} (${m.unit})` : m.label;
      charts.push(`<section><h2>${title}</h2>${chart}</section>`);
    }
  }

  const content =
    tiles.length === 0
      ? `<p class="meta">No health data found for this range.</p>`
      : `<div class="tiles">${tiles.join("")}</div>\n${charts.join("\n")}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HealthSync – ${rangeLabel}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>HealthSync – ${rangeLabel}</h1>
<p class="meta">Range: ${p.range} · Generated ${p.generatedAt}</p>
${content}
</body>
</html>
`;
}

const W = 640;
const H = 200;
const PAD_X = 44;
const PAD_Y = 26;

function lineChart(values: Array<number | undefined>, dates: string[], decimals: number): string {
  const present = values
    .map((v, i) => ({ v, i }))
    .filter((pt): pt is { v: number; i: number } => pt.v !== undefined);
  const min = Math.min(...present.map((pt) => pt.v));
  const max = Math.max(...present.map((pt) => pt.v));
  const span = max - min || 1;
  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / Math.max(values.length - 1, 1);
  const y = (v: number) => H - PAD_Y - ((v - min) * (H - 2 * PAD_Y)) / span;

  const segments: string[] = [];
  let run: Array<{ v: number; i: number }> = [];
  const flush = () => {
    if (run.length > 1) {
      const pts = run.map((pt) => `${x(pt.i).toFixed(1)},${y(pt.v).toFixed(1)}`).join(" ");
      segments.push(`<polyline class="chart-line" points="${pts}" />`);
    }
    run = [];
  };
  for (const [i, v] of values.entries()) {
    if (v === undefined) flush();
    else run.push({ v, i });
  }
  flush();

  const dots = present
    .map(
      (pt) =>
        `<circle class="chart-dot" cx="${x(pt.i).toFixed(1)}" cy="${y(pt.v).toFixed(1)}" r="4"><title>${dates[pt.i]}: ${fmt(pt.v, decimals)}</title></circle>`,
    )
    .join("");

  const levels = max === min ? [max] : [max, min];
  const grid = levels
    .map(
      (v) =>
        `<line class="chart-grid" x1="${PAD_X}" y1="${y(v).toFixed(1)}" x2="${W - PAD_X}" y2="${y(v).toFixed(1)}" />`,
    )
    .join("");
  const levelLabels = levels
    .map(
      (v) =>
        `<text class="chart-text" x="${PAD_X - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, decimals)}</text>`,
    )
    .join("");
  const labels = `${levelLabels}<text class="chart-text" x="${PAD_X}" y="${H - 8}">${dates[0] ?? ""}</text><text class="chart-text" x="${W - PAD_X}" y="${H - 8}" text-anchor="end">${dates[dates.length - 1] ?? ""}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="daily trend">${grid}${segments.join("")}${dots}${labels}</svg>`;
}

function fmt(v: number, decimals: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
