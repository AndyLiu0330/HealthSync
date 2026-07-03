# Dashboard UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current report-style `dashboard.html` renderer with a desktop-first card dashboard that matches the approved health-app-inspired design while preserving existing metric math and range behavior.

**Architecture:** Keep all data collection and metric extraction logic in `packages/core/src/report/render.ts`, but split rendering into layout-oriented helpers. The final HTML remains a self-contained static document with range-aware sections: header, primary cards, secondary cards, and trend cards for multi-day views.

**Tech Stack:** TypeScript, Vitest, static HTML/CSS generation in `@healthsync/core`, CLI dashboard generation through `@healthsync/cli`

---

### Task 1: Lock the New Dashboard Structure in Tests

**Files:**
- Modify: `packages/core/src/report/render.test.ts`
- Reference: `packages/core/src/report/render.ts`

- [ ] **Step 1: Write the failing structure test for the new layout**

Add this test near the existing `renderDashboard` specs:

```ts
  it("renders the new dashboard layout containers for a multi-day range", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        {
          date: "2026-06-25",
          steps: { total: 4200 },
          calories: { total: 2100 },
          heartRate: { average: 88 },
          activeZoneMinutes: { total: 22 },
        },
        {
          date: "2026-06-26",
          steps: { total: 6100 },
          calories: { total: 2250 },
          heartRate: { average: 91 },
          activeZoneMinutes: { total: 18 },
        },
      ],
      generatedAt: GEN,
      types: ["steps", "calories", "heart-rate", "active-zone-minutes"],
    });
    expect(html).toContain('class="dashboard-shell"');
    expect(html).toContain('class="primary-grid"');
    expect(html).toContain('class="secondary-grid"');
    expect(html).toContain('class="trend-grid"');
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: FAIL because the current HTML does not include the new dashboard container classes.

- [ ] **Step 3: Add a day-range test that proves trend cards are omitted**

Add this test after the existing day-range test:

```ts
  it("omits the trend grid entirely for day range", () => {
    const html = renderDashboard({
      range: "day",
      days: [
        {
          date: "2026-07-01",
          steps: { total: 4321 },
          calories: { total: 1880 },
        },
      ],
      generatedAt: GEN,
      types: ["steps", "calories"],
    });
    expect(html).not.toContain('class="trend-grid"');
  });
```

- [ ] **Step 4: Run the focused test suite again to verify the new assertion also fails or remains unmet**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: FAIL on missing layout classes and/or missing day-range trend omission behavior.

- [ ] **Step 5: Commit the failing test additions**

```bash
git add packages/core/src/report/render.test.ts
git commit -m "test: define dashboard UI layout expectations"
```

### Task 2: Refactor Metric Summaries Into Layout-Friendly Data

**Files:**
- Modify: `packages/core/src/report/render.ts`
- Test: `packages/core/src/report/render.test.ts`

- [ ] **Step 1: Introduce a summary model for rendered metrics**

In `packages/core/src/report/render.ts`, add helper types above `renderDashboard()`:

```ts
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
```

- [ ] **Step 2: Add a helper that computes metric summaries without changing math**

Add a helper below `METRICS`:

```ts
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
```

- [ ] **Step 3: Update `renderDashboard()` to read from `summarizeDashboard()` while preserving old visible output temporarily**

Temporarily replace the top of `renderDashboard()` with:

```ts
export function renderDashboard(p: RenderDashboardParams): string {
  const summary = summarizeDashboard(p);
  const tiles: string[] = [];
  const charts: string[] = [];

  for (const metric of summary.metrics) {
    const suffix = metric.aggregateLabel === "Average" ? " (avg)" : "";
    const unit = metric.unit ? `<span class="unit">${metric.unit}</span>` : "";
    const value = metric.displayValue === "—" ? "—" : `${metric.displayValue}${unit}`;
    tiles.push(
      `<div class="tile"><div class="label">${metric.label}${suffix}</div><div class="value">${value}</div></div>`,
    );
    if (p.days.length > 1) {
      const body =
        metric.present.length === 0
          ? `<p class="no-data">No data in this range</p>`
          : lineChart(
              metric.values,
              p.days.map((d) => d.date),
              metric.decimals,
            );
      charts.push(`<section><h2>${metric.title}</h2>${body}</section>`);
    }
  }

  const content = `<div class="tiles">${tiles.join("")}</div>\n${charts.join("\n")}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HealthSync – ${summary.rangeLabel}</title>
<style>${STYLE}</style>
</head>
<body>
<h1>HealthSync – ${summary.rangeLabel}</h1>
<p class="meta">${summary.generatedLabel}</p>
${content}
</body>
</html>
`;
}
```

- [ ] **Step 4: Run the renderer tests**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: Existing behavior tests stay green, new layout tests remain red.

- [ ] **Step 5: Commit the refactor scaffold**

```bash
git add packages/core/src/report/render.ts packages/core/src/report/render.test.ts
git commit -m "refactor: summarize dashboard metrics for layout rendering"
```

### Task 3: Implement the New Desktop Dashboard Shell and Card System

**Files:**
- Modify: `packages/core/src/report/render.ts`
- Test: `packages/core/src/report/render.test.ts`

- [ ] **Step 1: Replace the old style block with a dashboard-specific design system**

Update `STYLE` to a richer token set and desktop-first layout:

```ts
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
--calories-a:#f4d58d;
--calories-b:#e9b65a;
--sleep-a:#dbcaf7;
--sleep-b:#c7b0f0;
--heart-a:#ffc2bf;
--heart-b:#f19b97;
--active-a:#c8edbe;
--active-b:#a8db99;
--recovery-a:#edf3f6;
--recovery-b:#d9e4ea;
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
```
```

- [ ] **Step 2: Add layout and card helper renderers**

Add helpers below `renderDashboard()`:

```ts
function renderMetricCard(summary: MetricSummary, tone: string, extraClass = ""): string {
  const unit = summary.unit && summary.displayValue !== "—" ? `<span class="metric-unit">${summary.unit}</span>` : "";
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
```

- [ ] **Step 3: Render the new shell, header, primary grid, and secondary grid**

Replace the body-building portion of `renderDashboard()` with:

```ts
  const summary = summarizeDashboard(p);
  const byType = new Map(summary.metrics.map((metric) => [metric.type, metric]));
  const primaryTypes: DataType[] = ["steps", "calories", "sleep", "heart-rate", "active-zone-minutes"];
  const primary = primaryTypes.map((type) => byType.get(type)).filter((metric): metric is MetricSummary => metric !== undefined);
  const secondary = summary.metrics.filter((metric) => !primaryTypes.includes(metric.type));
  const hero =
    p.range === "day"
      ? primary[0] ?? summary.metrics[0]
      : byType.get("steps") ?? primary[0] ?? summary.metrics[0];
  const sideCards = primary.filter((metric) => metric !== hero).slice(0, 3);
  const supportCards = primary.filter((metric) => metric !== hero).slice(3);

  const subtitle = hero?.displayValue === "—"
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

  const secondaryHtml = secondary.length === 0
    ? ""
    : `<section class="secondary-grid">
        ${secondary.map((metric) => renderMetricCard(metric, metricTone(metric.type), "metric-card--compact")).join("")}
      </section>`;
```

- [ ] **Step 4: Finish the new document template**

Use this HTML skeleton return:

```ts
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
    ${p.range === "day" ? "" : `<section class="trend-grid"></section>`}
  </main>
</body>
</html>
`;
```

- [ ] **Step 5: Run the renderer tests**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: the new structure tests should now pass, while some existing expectations may still need updating in the next task.

- [ ] **Step 6: Commit the card layout implementation**

```bash
git add packages/core/src/report/render.ts packages/core/src/report/render.test.ts
git commit -m "feat: add card-based dashboard shell"
```

### Task 4: Replace the Old Chart Stack With Trend Cards

**Files:**
- Modify: `packages/core/src/report/render.ts`
- Modify: `packages/core/src/report/render.test.ts`

- [ ] **Step 1: Add a compact trend-card renderer**

Add helpers below `renderMetricCard()`:

```ts
function renderTrendCard(summary: MetricSummary, dates: string[], prominent = false): string {
  const chart =
    summary.present.length === 0
      ? `<div class="trend-empty">No data in this range</div>`
      : lineChart(summary.values, dates, summary.decimals);
  const unit = summary.unit ? `<span class="metric-unit">${summary.unit}</span>` : "";
  return `<article class="trend-card ${prominent ? "trend-card--hero" : ""}">
    <div class="trend-card__head">
      <div>
        <p class="trend-card__eyebrow">${summary.aggregateLabel}</p>
        <h2>${summary.label}</h2>
      </div>
      <div class="trend-card__metric">${summary.displayValue}${summary.displayValue === "—" ? "" : unit}</div>
    </div>
    ${chart}
  </article>`;
}
```

- [ ] **Step 2: Render prioritized trend cards for week and month**

Inside `renderDashboard()`, replace the placeholder trend grid with:

```ts
  const trendCandidates = summary.metrics.filter((metric) => metric.values.length > 1);
  const trendPriority: DataType[] = ["steps", "calories", "sleep", "heart-rate"];
  const prioritized = trendPriority
    .map((type) => trendCandidates.find((metric) => metric.type === type))
    .filter((metric): metric is MetricSummary => metric !== undefined);
  const fallbackTrend = trendCandidates.filter((metric) => !trendPriority.includes(metric.type));
  const trendMetrics = [...prioritized, ...fallbackTrend].slice(0, 4);
  const trendHtml =
    p.range === "day" || trendMetrics.length === 0
      ? ""
      : `<section class="trend-grid">
          ${trendMetrics
            .map((metric, index) => renderTrendCard(metric, p.days.map((d) => d.date), index === 0))
            .join("")}
        </section>`;
```

Then return `${trendHtml}` instead of the placeholder empty section.

- [ ] **Step 3: Update the tests to stop asserting the old `<section><h2>` chart stack**

Adjust the existing tests in `packages/core/src/report/render.test.ts`:

```ts
    expect(html).toContain('class="trend-card');
```

```ts
    expect(html).toContain("trend-empty");
```

```ts
    expect(html).not.toContain('class="trend-grid"');
```

Keep the assertions about values like `3,500`, `2,100`, and `No data in this range`.

- [ ] **Step 4: Run the focused renderer tests**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the trend-card redesign**

```bash
git add packages/core/src/report/render.ts packages/core/src/report/render.test.ts
git commit -m "feat: redesign dashboard trend cards"
```

### Task 5: Tighten Empty States, Responsive Behavior, and Styling Polish

**Files:**
- Modify: `packages/core/src/report/render.ts`
- Test: `packages/core/src/report/render.test.ts`

- [ ] **Step 1: Add responsive grid rules and compact-card polish to `STYLE`**

Append CSS rules like:

```ts
.primary-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:20px;align-items:stretch}
.summary-stack,.support-row,.secondary-grid,.trend-grid{display:grid;gap:20px}
.summary-stack{grid-template-columns:1fr}
.support-row{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:20px;grid-column:1/-1}
.secondary-grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:24px}
.trend-grid{grid-template-columns:1.35fr repeat(3,minmax(0,1fr));margin-top:28px}
.metric-card,.trend-card{
background:var(--surface);
border:1px solid var(--border);
border-radius:30px;
box-shadow:var(--shadow);
padding:24px;
}
@media (max-width: 980px){
  .primary-grid,.trend-grid{grid-template-columns:1fr}
}
```
```

- [ ] **Step 2: Add tone classes and typography details**

Add CSS selectors:

```ts
.tone-steps{background:linear-gradient(135deg,var(--steps-a),var(--steps-b))}
.tone-calories{background:linear-gradient(135deg,var(--calories-a),var(--calories-b))}
.tone-sleep{background:linear-gradient(135deg,var(--sleep-a),var(--sleep-b))}
.tone-heart{background:linear-gradient(135deg,var(--heart-a),var(--heart-b))}
.tone-active{background:linear-gradient(135deg,var(--active-a),var(--active-b))}
.tone-recovery{background:linear-gradient(135deg,var(--recovery-a),var(--recovery-b))}
.metric-card__value{font-size:clamp(2rem,3vw,4rem);font-weight:700;line-height:1.02}
.metric-card__eyebrow,.trend-card__eyebrow,.dashboard-kicker{
text-transform:uppercase;
letter-spacing:.08em;
font-size:.72rem;
color:var(--ink-2);
}
```

- [ ] **Step 3: Keep the SVG charts visually consistent inside cards**

Update the existing `svg`, `.chart-line`, `.chart-dot`, `.chart-grid`, `.chart-text` rules so charts no longer look like a separate old component:

```ts
svg{
display:block;
width:100%;
height:auto;
background:rgba(255,255,255,.58);
border:1px solid rgba(29,29,27,.06);
border-radius:22px;
padding:8px;
}
.chart-line{stroke:#2f6f67;stroke-width:3}
.chart-dot{fill:#2f6f67;stroke:#fffdf9;stroke-width:2}
```

- [ ] **Step 4: Run the renderer tests again**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the polish pass**

```bash
git add packages/core/src/report/render.ts
git commit -m "style: polish dashboard card presentation"
```

### Task 6: Full Verification and Real Dashboard Generation

**Files:**
- Verify only: `packages/core/src/report/render.ts`, `packages/core/src/report/render.test.ts`
- Inspect output: `/home/andy/.config/healthsync/dashboard.html`

- [ ] **Step 1: Run the full workspace build**

Run: `pnpm build`

Expected: both workspace packages build successfully.

- [ ] **Step 2: Run the focused renderer tests**

Run: `pnpm --filter @healthsync/core test -- src/report/render.test.ts`

Expected: PASS.

- [ ] **Step 3: Run the full workspace tests**

Run: `pnpm test`

Expected: PASS across `packages/core` and `packages/cli`.

- [ ] **Step 4: Run workspace typecheck**

Run: `pnpm -r typecheck`

Expected: PASS after build artifacts exist.

- [ ] **Step 5: Generate the real day dashboard**

Run: `node packages/cli/dist/index.js dashboard --range day`

Expected: command exits 0 and rewrites the local dashboard without warnings.

- [ ] **Step 6: Generate the real week dashboard**

Run: `node packages/cli/dist/index.js dashboard --range week`

Expected: command exits 0 and rewrites the local dashboard without warnings.

- [ ] **Step 7: Generate the real month dashboard**

Run: `node packages/cli/dist/index.js dashboard --range month`

Expected: command exits 0 and rewrites the local dashboard without warnings.

- [ ] **Step 8: Inspect the generated HTML for the new structure**

Run:

```bash
rg -n 'dashboard-shell|primary-grid|secondary-grid|trend-grid|metric-card--hero' /home/andy/.config/healthsync/dashboard.html
```

Expected: matches for all of the new layout primitives.

- [ ] **Step 9: Commit the verified redesign**

```bash
git add packages/core/src/report/render.ts packages/core/src/report/render.test.ts
git commit -m "feat: redesign dashboard html output"
```
