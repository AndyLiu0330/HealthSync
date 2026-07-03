import type { DataType } from "../config/index.js";
import type { CanonicalDay } from "../transform/json/index.js";

export type DashboardRange = "day" | "week" | "month";

export interface RenderDashboardParams {
  range: DashboardRange;
  days: CanonicalDay[]; // one entry per date in range, ascending
  generatedAt: string; // ISO 8601
  types: DataType[]; // enabled data types — metrics for other types are not rendered
}

interface MetricSpec {
  type: DataType;
  label: string;
  unit: string;
  agg: "sum" | "avg";
  decimals: number;
  extract: (d: CanonicalDay) => number | undefined;
}

interface MetricSummary {
  type: DataType;
  label: string;
  title: string;
  unit: string;
  decimals: number;
  aggregateLabel: string;
  values: Array<number | undefined>;
  present: number[];
  displayValue: string;
  numericValue?: number;
}

interface DashboardSummary {
  rangeLabel: string;
  generatedLabel: string;
  metrics: MetricSummary[];
}

const METRICS: MetricSpec[] = [
  {
    type: "steps",
    label: "Steps",
    unit: "",
    agg: "sum",
    decimals: 0,
    extract: (d) => d.steps?.total,
  },
  {
    type: "calories",
    label: "Calories",
    unit: "kcal",
    agg: "sum",
    decimals: 0,
    extract: (d) => d.calories?.total,
  },
  {
    type: "heart-rate",
    label: "Heart rate",
    unit: "bpm",
    agg: "avg",
    decimals: 0,
    extract: (d) => d.heartRate?.average ?? d.heartRate?.resting,
  },
  {
    type: "resting-heart-rate",
    label: "Resting heart rate",
    unit: "bpm",
    agg: "avg",
    decimals: 0,
    extract: (d) => d.restingHeartRate?.bpm,
  },
  {
    type: "heart-rate-variability",
    label: "Heart rate variability",
    unit: "ms",
    agg: "avg",
    decimals: 1,
    extract: (d) => d.heartRateVariability?.rmssdMs,
  },
  {
    type: "respiratory-rate",
    label: "Respiratory rate",
    unit: "br/min",
    agg: "avg",
    decimals: 1,
    extract: (d) => d.respiratoryRate?.breathsPerMinute,
  },
  {
    type: "sleep",
    label: "Sleep",
    unit: "h",
    agg: "avg",
    decimals: 1,
    extract: (d) =>
      d.sleep?.durationMinutes === undefined ? undefined : d.sleep.durationMinutes / 60,
  },
  {
    type: "active-zone-minutes",
    label: "Active zone minutes",
    unit: "min",
    agg: "sum",
    decimals: 0,
    extract: (d) => d.activeZoneMinutes?.total,
  },
  {
    type: "spo2",
    label: "SpO2",
    unit: "%",
    agg: "avg",
    decimals: 1,
    extract: (d) => d.spo2?.averageOvernight,
  },
];

const STYLE = `
:root{
--page:#f5f1ea;
--surface:#fffdf9;
--surface-2:#f8f3ec;
--ink:#1d1d1b;
--ink-2:#5f5a53;
--muted:#8d877f;
--border:rgba(50,39,24,.08);
--shadow:0 18px 40px rgba(62,44,24,.08);
--steps-a:#a8ece6;
--steps-b:#76d6cf;
--calories-a:#f5d88f;
--calories-b:#e7bc63;
--sleep-a:#ddcdf8;
--sleep-b:#c8b3f1;
--heart-a:#ffc7c4;
--heart-b:#f1a39e;
--active-a:#d4f1c7;
--active-b:#afde9d;
--recovery-a:#eef4f6;
--recovery-b:#dfe8ec;
--chart:#2f6f67;
--chart-grid:rgba(29,29,27,.12);
}
*{box-sizing:border-box}
body{
margin:0;
font-family:"Avenir Next","Segoe UI",system-ui,sans-serif;
background:
radial-gradient(circle at top left, rgba(255,255,255,.7), transparent 32%),
linear-gradient(180deg, #f7f3ed 0%, var(--page) 100%);
color:var(--ink);
}
.dashboard-shell{
max-width:1240px;
margin:0 auto;
padding:40px 24px 64px;
}
.dashboard-header{margin-bottom:24px}
.dashboard-kicker,.metric-card__eyebrow,.trend-card__eyebrow{
margin:0 0 8px;
text-transform:uppercase;
letter-spacing:.08em;
font-size:.72rem;
font-weight:700;
color:var(--ink-2);
}
.dashboard-header__row{
display:flex;
justify-content:space-between;
gap:24px;
align-items:flex-end;
flex-wrap:wrap;
}
h1{
margin:0;
font-size:clamp(2.25rem,5vw,4.4rem);
line-height:.96;
letter-spacing:-.04em;
}
.dashboard-subtitle{
margin:.7rem 0 0;
font-size:1rem;
line-height:1.6;
max-width:58ch;
color:var(--ink-2);
}
.dashboard-meta{
margin:0;
font-size:.92rem;
color:var(--muted);
}
.primary-grid{
display:grid;
grid-template-columns:1.4fr 1fr;
gap:20px;
align-items:stretch;
}
.hero-panel{min-height:100%}
.summary-stack,.secondary-grid{
display:grid;
gap:20px;
}
.support-row{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
gap:20px;
grid-column:1 / -1;
}
.secondary-grid{
grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
margin-top:24px;
}
.trend-grid{
display:grid;
grid-template-columns:1.35fr repeat(3,minmax(0,1fr));
gap:20px;
margin-top:28px;
}
.metric-card,.trend-card{
background:var(--surface);
border:1px solid var(--border);
border-radius:30px;
box-shadow:var(--shadow);
padding:24px;
overflow:hidden;
}
.metric-card{
min-height:180px;
display:flex;
flex-direction:column;
justify-content:space-between;
}
.metric-card--hero{
min-height:380px;
padding:30px;
}
.metric-card--compact{
min-height:170px;
}
.metric-card__value{
font-size:clamp(2.1rem,4vw,4rem);
font-weight:700;
line-height:1.02;
letter-spacing:-.05em;
}
.metric-unit{
font-size:.34em;
font-weight:600;
letter-spacing:0;
margin-left:.28rem;
color:var(--ink-2);
}
.metric-subtle{
margin:.85rem 0 0;
font-size:.98rem;
color:var(--ink-2);
}
.tone-steps{background:linear-gradient(135deg,var(--steps-a),var(--steps-b))}
.tone-calories{background:linear-gradient(135deg,var(--calories-a),var(--calories-b))}
.tone-sleep{background:linear-gradient(135deg,var(--sleep-a),var(--sleep-b))}
.tone-heart{background:linear-gradient(135deg,var(--heart-a),var(--heart-b))}
.tone-active{background:linear-gradient(135deg,var(--active-a),var(--active-b))}
.tone-recovery{background:linear-gradient(135deg,var(--recovery-a),var(--recovery-b))}
.trend-card{
background:var(--surface-2);
display:flex;
flex-direction:column;
gap:18px;
}
.trend-card--hero{
grid-column:auto;
}
.trend-card__head{
display:flex;
justify-content:space-between;
gap:16px;
align-items:flex-end;
}
.trend-card__head h2{
margin:0;
font-size:1.35rem;
line-height:1.1;
}
.trend-card__metric{
font-size:1.5rem;
font-weight:700;
letter-spacing:-.03em;
}
.trend-empty{
display:flex;
align-items:center;
justify-content:center;
min-height:200px;
border-radius:22px;
background:rgba(255,255,255,.62);
border:1px dashed rgba(29,29,27,.10);
color:var(--muted);
font-size:.95rem;
}
svg{
display:block;
width:100%;
height:auto;
background:rgba(255,255,255,.58);
border:1px solid rgba(29,29,27,.06);
border-radius:22px;
padding:8px;
}
.chart-line{fill:none;stroke:var(--chart);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.chart-dot{fill:var(--chart);stroke:#fffdf9;stroke-width:2}
.chart-grid{stroke:var(--chart-grid);stroke-width:1}
.chart-text{font:11px system-ui,sans-serif;fill:var(--muted)}
@media (max-width: 980px){
  .primary-grid,.trend-grid{grid-template-columns:1fr}
}
@media (max-width: 720px){
  .dashboard-shell{padding:24px 16px 40px}
  .metric-card,.trend-card{border-radius:24px}
}
`;

export function renderDashboard(p: RenderDashboardParams): string {
  const summary = summarizeDashboard(p);
  const byType = new Map(summary.metrics.map((metric) => [metric.type, metric]));
  const primaryOrder: DataType[] = [
    "steps",
    "calories",
    "sleep",
    "heart-rate",
    "active-zone-minutes",
  ];
  const primary = primaryOrder
    .map((type) => byType.get(type))
    .filter((metric): metric is MetricSummary => metric !== undefined);
  const secondary = summary.metrics.filter((metric) => !primaryOrder.includes(metric.type));
  const hero =
    p.range === "day"
      ? primary[0] ?? summary.metrics[0]
      : byType.get("steps") ?? primary[0] ?? summary.metrics[0];
  const sideCards = primary.filter((metric) => metric !== hero).slice(0, 3);
  const supportCards = primary.filter((metric) => metric !== hero).slice(3);
  const subtitle =
    hero?.displayValue === "—"
      ? "A calm snapshot of your tracked health metrics."
      : `A desktop dashboard view of your ${p.range} health trends.`;

  const primaryHtml = hero
    ? `<section class="primary-grid">
        <div class="hero-panel">
          ${renderMetricCard(hero, metricTone(hero.type), "metric-card--hero")}
        </div>
        <div class="summary-stack">
          ${sideCards.map((metric) => renderMetricCard(metric, metricTone(metric.type))).join("")}
        </div>
        <div class="support-row">
          ${supportCards.map((metric) => renderMetricCard(metric, metricTone(metric.type))).join("")}
        </div>
      </section>`
    : "";

  const secondaryHtml = `<section class="secondary-grid">${
    secondary
      .map((metric) => renderMetricCard(metric, metricTone(metric.type), "metric-card--compact"))
      .join("") || ""
  }</section>`;

  const trendMetrics = trendSelection(summary.metrics);
  const trendHtml =
    p.range === "day" || trendMetrics.length === 0
      ? ""
      : `<section class="trend-grid">
          ${trendMetrics
            .map((metric, index) =>
              renderTrendCard(metric, p.days.map((d) => d.date), index === 0),
            )
            .join("")}
        </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HealthSync – ${summary.rangeLabel}</title>
<style>${STYLE}</style>
</head>
<body>
  <main class="dashboard-shell">
    <header class="dashboard-header">
      <p class="dashboard-kicker">HealthSync dashboard</p>
      <div class="dashboard-header__row">
        <div>
          <h1>${summary.rangeLabel}</h1>
          <p class="dashboard-subtitle">${subtitle}</p>
        </div>
        <p class="dashboard-meta">${summary.generatedLabel}</p>
      </div>
    </header>
    ${primaryHtml}
    ${secondaryHtml}
    ${trendHtml}
  </main>
</body>
</html>
`;
}

function summarizeDashboard(p: RenderDashboardParams): DashboardSummary {
  const first = p.days[0]?.date ?? "";
  const last = p.days[p.days.length - 1]?.date ?? "";
  const rangeLabel = p.range === "day" ? last : `${first} – ${last}`;

  const metrics = METRICS.filter((metric) => p.types.includes(metric.type)).map((metric) => {
    const values = p.days.map((d) => metric.extract(d));
    const present = values.filter((v): v is number => v !== undefined);
    const total = present.reduce((a, b) => a + b, 0);
    const numericValue =
      present.length === 0 ? undefined : metric.agg === "sum" ? total : total / present.length;

    return {
      type: metric.type,
      label: metric.label,
      title: metric.unit ? `${metric.label} (${metric.unit})` : metric.label,
      unit: metric.unit,
      decimals: metric.decimals,
      aggregateLabel: metric.agg === "avg" && p.range !== "day" ? "Average" : "Total",
      values,
      present,
      ...(numericValue === undefined
        ? { displayValue: "—" }
        : { displayValue: fmt(numericValue, metric.decimals), numericValue }),
    };
  });

  return {
    rangeLabel,
    generatedLabel: `Range: ${p.range} · Generated ${p.generatedAt}`,
    metrics,
  };
}

function renderMetricCard(summary: MetricSummary, tone: string, extraClass = ""): string {
  const unit =
    summary.unit && summary.displayValue !== "—"
      ? `<span class="metric-unit">${summary.unit}</span>`
      : "";
  const subtitle =
    summary.displayValue === "—"
      ? `<p class="metric-subtle">No data in this range</p>`
      : `<p class="metric-subtle">${summary.aggregateLabel}</p>`;
  return `<article class="metric-card tone-${tone} ${extraClass}">
    <div class="metric-card__eyebrow">${summary.label}</div>
    <div class="metric-card__value">${summary.displayValue}${unit}</div>
    ${subtitle}
  </article>`;
}

function renderTrendCard(summary: MetricSummary, dates: string[], prominent = false): string {
  const chart =
    summary.present.length === 0
      ? `<div class="trend-empty">No data in this range</div>`
      : lineChart(summary.values, dates, summary.decimals);
  const unit =
    summary.unit && summary.displayValue !== "—"
      ? `<span class="metric-unit">${summary.unit}</span>`
      : "";
  return `<article class="trend-card ${prominent ? "trend-card--hero" : ""}">
    <div class="trend-card__head">
      <div>
        <p class="trend-card__eyebrow">${summary.aggregateLabel}</p>
        <h2>${summary.label}</h2>
      </div>
      <div class="trend-card__metric">${summary.displayValue}${unit}</div>
    </div>
    ${chart}
  </article>`;
}

function trendSelection(metrics: MetricSummary[]): MetricSummary[] {
  const trendPriority: DataType[] = ["steps", "calories", "sleep", "heart-rate"];
  const prioritized = trendPriority
    .map((type) => metrics.find((metric) => metric.type === type))
    .filter((metric): metric is MetricSummary => metric !== undefined);
  const fallback = metrics.filter((metric) => !trendPriority.includes(metric.type));
  return [...prioritized, ...fallback].slice(0, 4);
}

function metricTone(type: DataType): string {
  switch (type) {
    case "steps":
      return "steps";
    case "calories":
      return "calories";
    case "sleep":
      return "sleep";
    case "heart-rate":
      return "heart";
    case "active-zone-minutes":
      return "active";
    default:
      return "recovery";
  }
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
