# Dashboard v2 (Complete Metrics + 4 New Data Types) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every enabled metric always renders on the dashboard ("—" when no data, real 0 when zero), and four new data types are synced + displayed: resting heart rate, heart rate variability, respiratory rate, calories.

**Architecture:** Extend the existing type pipeline end to end: config `SUPPORTED_DATA_TYPES` → `HealthClient` TYPE_QUERIES → `toCanonical`/`CanonicalDay` → sync `hasPayload` + Markdown sections → renderer METRICS (now always-rendered, filtered by a new `types` param) → orchestrator per-type backfill (sync only the types missing for each date, so old days pick up the new types).

**Tech Stack:** TypeScript ESM (NodeNext — relative imports need `.js`), vitest, nock, biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-03-dashboard-v2-design.md`

## Global Constraints

- Run all commands from the repo root (this worktree). No new dependencies.
- All relative imports end in `.js`. Biome formatting (2-space, double quotes). `pnpm lint` has a broken wrapper in this environment (OOM warning) — use `node_modules/.bin/biome check .` instead; it must report 0 errors.
- New config keys and exact API mappings (copy verbatim):
  - `calories` → dataType `total-calories`, filterField `total_calories`, kind `interval`, pageSize 10000
  - `resting-heart-rate` → dataType `daily-resting-heart-rate`, filterField `daily_resting_heart_rate`, kind `daily`, pageSize 10000
  - `heart-rate-variability` → dataType `daily-heart-rate-variability`, filterField `daily_heart_rate_variability`, kind `daily`, pageSize 10000
  - `respiratory-rate` → dataType `daily-respiratory-rate`, filterField `daily_respiratory_rate`, kind `daily`, pageSize 10000
- v4 REST point payload field names (camelCase JSON): `dailyRestingHeartRate.beatsPerMinute`, `dailyHeartRateVariability.averageHeartRateVariabilityMilliseconds`, `dailyRespiratoryRate.breathsPerMinute`. `totalCalories` payload is under-documented pre-launch — parse tolerantly (see Task 2 code) like the existing v1 fallbacks.
- Do not rename or remove any existing export. `RunDashboardResult` keeps its exact shape.
- The CLI package resolves core from `packages/core/dist` — run `pnpm build` before `pnpm --filter @healthsync/cli test` or `pnpm typecheck` whenever core's public API changed.
- TDD per task: failing test → verify fail → implement → verify pass → biome → commit with the exact message given.

---

### Task 1: Config + HealthClient support for the four new types

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Modify: `packages/core/src/google-health/index.ts`
- Test: `packages/core/src/google-health/index.test.ts`

**Interfaces:**
- Consumes: existing `TYPE_QUERIES` table and `buildTypeQuery` (kinds "daily" and "interval" already exist — no new kind logic needed).
- Produces: `DataType` union gains `"calories" | "resting-heart-rate" | "heart-rate-variability" | "respiratory-rate"`; `DEFAULT_CONFIG.dataTypes` includes all nine; `HealthClient.fetch` works for the new types. NOTE: after this task `packages/core` will NOT compile — `toCanonical` and `hasPayload` switch statements become non-exhaustive. That is expected mid-task-sequence; Task 2 restores compilation. Run only the focused vitest file in this task, not typecheck.

- [ ] **Step 1: Write the failing test**

Append inside `describe("HealthClient.fetch", ...)` in `packages/core/src/google-health/index.test.ts`:

```ts
  it("builds a daily-date filter for resting heart rate", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints")
      .query((q) => {
        expect(q.filter).toBe(
          'daily_resting_heart_rate.date >= "2026-07-01" AND daily_resting_heart_rate.date < "2026-07-02"',
        );
        return true;
      })
      .reply(200, { dataPoints: [{ dailyRestingHeartRate: { beatsPerMinute: "55" } }] });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "resting-heart-rate",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
    });
    expect(result.points).toEqual([{ dailyRestingHeartRate: { beatsPerMinute: "55" } }]);
  });

  it("builds an interval filter for calories", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v4/users/me/dataTypes/total-calories/dataPoints")
      .query((q) => {
        expect(q.filter).toBe(
          'total_calories.interval.start_time >= "2026-07-01T00:00:00.000Z" AND total_calories.interval.start_time < "2026-07-02T00:00:00.000Z"',
        );
        return true;
      })
      .reply(200, { dataPoints: [{ totalCalories: { calories: 2100 } }] });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "calories",
      startTime: "2026-07-01T00:00:00.000Z",
      endTime: "2026-07-02T00:00:00.000Z",
    });
    expect(result.points).toHaveLength(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @healthsync/core exec vitest run src/google-health/index.test.ts`
Expected: FAIL — vitest transpiles without typechecking, so the failure is at runtime: `TYPE_QUERIES` has no entry for the new type (`TypeError` reading `kind` in `buildTypeQuery`).

- [ ] **Step 3: Implement**

`packages/core/src/config/schema.ts` — replace the array:

```ts
export const SUPPORTED_DATA_TYPES = [
  "steps",
  "calories",
  "heart-rate",
  "resting-heart-rate",
  "heart-rate-variability",
  "respiratory-rate",
  "sleep",
  "active-zone-minutes",
  "spo2",
] as const;
```

(`DEFAULT_CONFIG.dataTypes` already spreads `SUPPORTED_DATA_TYPES` — no other change.)

`packages/core/src/google-health/index.ts` — add to `TYPE_QUERIES` (keep alphabetical-ish grouping; exact entries):

```ts
  calories: {
    dataType: "total-calories",
    filterField: "total_calories",
    kind: "interval",
    pageSize: 10000,
  },
  "resting-heart-rate": {
    dataType: "daily-resting-heart-rate",
    filterField: "daily_resting_heart_rate",
    kind: "daily",
    pageSize: 10000,
  },
  "heart-rate-variability": {
    dataType: "daily-heart-rate-variability",
    filterField: "daily_heart_rate_variability",
    kind: "daily",
    pageSize: 10000,
  },
  "respiratory-rate": {
    dataType: "daily-respiratory-rate",
    filterField: "daily_respiratory_rate",
    kind: "daily",
    pageSize: 10000,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @healthsync/core exec vitest run src/google-health/index.test.ts src/config`
Expected: PASS. (Do NOT run the whole core suite or typecheck yet — `toCanonical`/`hasPayload` are intentionally non-exhaustive until Task 2. If the config test file asserts the exact default list, update it to the nine types.)

- [ ] **Step 5: Check config test**

Open `packages/core/src/config/index.test.ts`; if any assertion hardcodes the five-type list (e.g. `toEqual(["steps", ...])` or a length), update it to the new nine-type list. Run: `pnpm --filter @healthsync/core exec vitest run src/config/index.test.ts` — PASS.

- [ ] **Step 6: Format check and commit**

```bash
node_modules/.bin/biome check packages/core/src/config packages/core/src/google-health
git add packages/core/src/config/ packages/core/src/google-health/
git commit -m "feat(core): support calories, resting HR, HRV, respiratory rate data types"
```

---

### Task 2: Canonical model + sync payload detection

**Files:**
- Modify: `packages/core/src/transform/json/index.ts`
- Modify: `packages/core/src/sync/index.ts` (only `hasPayload`)
- Test: `packages/core/src/transform/json/index.test.ts`

**Interfaces:**
- Consumes: `DataType` union from Task 1; existing helpers in `transform/json/index.ts` (`asObject`, `asNumber`, `numberValue`, `isNumber`, `sum`, `average`, `defined`, `opt`).
- Produces (used by Tasks 3-5): `CanonicalDay` gains exactly:

```ts
  calories?: { total?: number };
  restingHeartRate?: { bpm?: number };
  heartRateVariability?: { rmssdMs?: number };
  respiratoryRate?: { breathsPerMinute?: number };
```

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/src/transform/json/index.test.ts` (inside the existing top-level describe, or a new `describe("toCanonical v2 types", ...)` block):

```ts
describe("toCanonical v2 types", () => {
  const base = { startTime: "2026-07-01T00:00:00.000Z", endTime: "2026-07-02T00:00:00.000Z" };

  it("parses daily resting heart rate", () => {
    const day = toCanonical({
      ...base,
      type: "resting-heart-rate",
      points: [{ dailyRestingHeartRate: { beatsPerMinute: "55" } }],
    });
    expect(day.restingHeartRate?.bpm).toBe(55);
  });

  it("averages HRV across points", () => {
    const day = toCanonical({
      ...base,
      type: "heart-rate-variability",
      points: [
        { dailyHeartRateVariability: { averageHeartRateVariabilityMilliseconds: 40 } },
        { dailyHeartRateVariability: { averageHeartRateVariabilityMilliseconds: 60 } },
      ],
    });
    expect(day.heartRateVariability?.rmssdMs).toBe(50);
  });

  it("parses daily respiratory rate", () => {
    const day = toCanonical({
      ...base,
      type: "respiratory-rate",
      points: [{ dailyRespiratoryRate: { breathsPerMinute: 14.2 } }],
    });
    expect(day.respiratoryRate?.breathsPerMinute).toBe(14.2);
  });

  it("sums calories intervals, tolerating alternate field names", () => {
    const day = toCanonical({
      ...base,
      type: "calories",
      points: [{ totalCalories: { calories: 1200 } }, { totalCalories: { kilocalories: "900" } }],
    });
    expect(day.calories?.total).toBe(2100);
  });

  it("returns bare date when a v2 type has no points", () => {
    const day = toCanonical({ ...base, type: "calories", points: [] });
    expect(day).toEqual({ date: "2026-07-01" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @healthsync/core exec vitest run src/transform/json/index.test.ts`
Expected: FAIL — at runtime the `toCanonical` switch has no case for the new types, so it returns `undefined` and the assertions throw (`Cannot read properties of undefined`).

- [ ] **Step 3: Implement**

In `packages/core/src/transform/json/index.ts`:

1. Add the four optional fields to `CanonicalDay` exactly as in **Produces** above.
2. Add four cases to the `switch (result.type)` in `toCanonical` (before the closing brace; each mirrors the spo2 pattern — documented field first, tolerant fallback):

```ts
    case "calories": {
      const totals = result.points
        .map((p) => {
          const tc = asObject(asObject(p)?.totalCalories);
          return (
            numberValue(tc?.calories) ??
            numberValue(tc?.kilocalories) ??
            asNumber(tc?.energy, "kilocalories")
          );
        })
        .filter(isNumber);
      if (totals.length > 0) {
        return { date, calories: { total: Math.round(sum(totals)) } };
      }
      return { date, calories: { ...defined("total", opt(point.value)) } };
    }
    case "resting-heart-rate": {
      const values = result.points
        .map((p) => asNumber(asObject(p)?.dailyRestingHeartRate, "beatsPerMinute"))
        .filter(isNumber);
      if (values.length > 0) {
        return { date, restingHeartRate: { bpm: Math.round(average(values)) } };
      }
      return { date, restingHeartRate: { ...defined("bpm", opt(point.beatsPerMinute)) } };
    }
    case "heart-rate-variability": {
      const values = result.points
        .map((p) =>
          asNumber(
            asObject(p)?.dailyHeartRateVariability,
            "averageHeartRateVariabilityMilliseconds",
          ),
        )
        .filter(isNumber);
      if (values.length > 0) {
        return { date, heartRateVariability: { rmssdMs: average(values) } };
      }
      return { date, heartRateVariability: { ...defined("rmssdMs", opt(point.rmssdMs)) } };
    }
    case "respiratory-rate": {
      const values = result.points
        .map((p) => asNumber(asObject(p)?.dailyRespiratoryRate, "breathsPerMinute"))
        .filter(isNumber);
      if (values.length > 0) {
        return { date, respiratoryRate: { breathsPerMinute: average(values) } };
      }
      return {
        date,
        respiratoryRate: { ...defined("breathsPerMinute", opt(point.breathsPerMinute)) },
      };
    }
```

In `packages/core/src/sync/index.ts`, add to the `hasPayload` switch:

```ts
    case "calories":
      return day.calories !== undefined;
    case "resting-heart-rate":
      return day.restingHeartRate !== undefined;
    case "heart-rate-variability":
      return day.heartRateVariability !== undefined;
    case "respiratory-rate":
      return day.respiratoryRate !== undefined;
```

- [ ] **Step 4: Run the whole core suite (compilation is restored)**

Run: `pnpm --filter @healthsync/core test`
Expected: PASS — except `src/report/render.test.ts`/`run.test.ts` MUST still pass unchanged (renderer untouched so far). If anything unrelated fails, stop and report.

- [ ] **Step 5: Format check and commit**

```bash
node_modules/.bin/biome check packages/core/src/transform packages/core/src/sync
git add packages/core/src/transform/json/ packages/core/src/sync/
git commit -m "feat(core): canonicalize the four new data types"
```

---

### Task 3: Markdown daily-note sections for the new types

**Files:**
- Create: `packages/core/src/transform/markdown/sections/calories.ts`
- Create: `packages/core/src/transform/markdown/sections/resting-heart-rate.ts`
- Create: `packages/core/src/transform/markdown/sections/heart-rate-variability.ts`
- Create: `packages/core/src/transform/markdown/sections/respiratory-rate.ts`
- Modify: `packages/core/src/transform/markdown/index.ts` (ORDER table)
- Test: `packages/core/src/transform/markdown/index.test.ts`

**Interfaces:**
- Consumes: `CanonicalDay` v2 fields from Task 2; existing section pattern — `(day: CanonicalDay) => string | null`, e.g. `sections/spo2.ts`.
- Produces: `renderDailyNote` includes the new sections when data is present; ORDER keys are the exact `DataType` strings (they feed the front-matter `types:` list and raw-file wikilinks).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/transform/markdown/index.test.ts`:

```ts
  it("renders sections for the v2 types when present", () => {
    const md = renderDailyNote({
      date: "2026-07-01",
      calories: { total: 2100 },
      restingHeartRate: { bpm: 55 },
      heartRateVariability: { rmssdMs: 48.5 },
      respiratoryRate: { breathsPerMinute: 14.2 },
    });
    expect(md).toContain("Calories");
    expect(md).toContain("2100 kcal");
    expect(md).toContain("55 bpm");
    expect(md).toContain("48.5 ms");
    expect(md).toContain("14.2");
    expect(md).toContain(
      "types: [calories, resting-heart-rate, heart-rate-variability, respiratory-rate]",
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @healthsync/core exec vitest run src/transform/markdown/index.test.ts`
Expected: FAIL — sections missing from output.

- [ ] **Step 3: Implement**

`sections/calories.ts`:

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderCaloriesSection(day: CanonicalDay): string | null {
  const c = day.calories;
  if (!c || typeof c.total !== "number") return null;
  return ["## 🔥 Calories", `- **Total**: ${c.total} kcal`].join("\n");
}
```

`sections/resting-heart-rate.ts`:

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderRestingHeartRateSection(day: CanonicalDay): string | null {
  const r = day.restingHeartRate;
  if (!r || typeof r.bpm !== "number") return null;
  return ["## 💓 Resting Heart Rate", `- **Resting HR**: ${r.bpm} bpm`].join("\n");
}
```

`sections/heart-rate-variability.ts`:

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderHeartRateVariabilitySection(day: CanonicalDay): string | null {
  const h = day.heartRateVariability;
  if (!h || typeof h.rmssdMs !== "number") return null;
  return ["## 📈 Heart Rate Variability", `- **RMSSD**: ${h.rmssdMs.toFixed(1)} ms`].join("\n");
}
```

`sections/respiratory-rate.ts`:

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderRespiratoryRateSection(day: CanonicalDay): string | null {
  const r = day.respiratoryRate;
  if (!r || typeof r.breathsPerMinute !== "number") return null;
  return [
    "## 🌬️ Respiratory Rate",
    `- **Breaths per minute**: ${r.breathsPerMinute.toFixed(1)}`,
  ].join("\n");
}
```

`markdown/index.ts` — imports plus new ORDER (keys must be the exact DataType strings; order matches the dashboard metric order):

```ts
const ORDER = [
  { key: "steps", render: renderStepsSection },
  { key: "calories", render: renderCaloriesSection },
  { key: "heart-rate", render: renderHeartRateSection },
  { key: "resting-heart-rate", render: renderRestingHeartRateSection },
  { key: "heart-rate-variability", render: renderHeartRateVariabilitySection },
  { key: "respiratory-rate", render: renderRespiratoryRateSection },
  { key: "sleep", render: renderSleepSection },
  { key: "active-zone-minutes", render: renderActiveZoneMinutesSection },
  { key: "spo2", render: renderSpo2Section },
] as const;
```

- [ ] **Step 4: Run the core suite**

Run: `pnpm --filter @healthsync/core test`
Expected: PASS.

- [ ] **Step 5: Format check and commit**

```bash
node_modules/.bin/biome check packages/core/src/transform
git add packages/core/src/transform/markdown/
git commit -m "feat(core): daily-note sections for calories, resting HR, HRV, respiratory rate"
```

---

### Task 4: Renderer v2 — always show every enabled metric

**Files:**
- Modify: `packages/core/src/report/render.ts`
- Test: `packages/core/src/report/render.test.ts` (rewrite — full file below)

**Interfaces:**
- Consumes: `CanonicalDay` v2 fields (Task 2), `DataType` (Task 1).
- Produces (Task 5 depends on this): `RenderDashboardParams` gains a REQUIRED `types: DataType[]` field. Metrics render in this fixed order, filtered to `types`: Steps, Calories, Heart rate, Resting heart rate, HRV, Respiratory rate, Sleep, Active zone minutes, SpO2. Tiles always render ("—" when the range has no data for the metric; a true 0 renders as "0"). Chart sections always render for week/month; a metric with no data in the range gets `<p class="no-data">No data in this range</p>` instead of an SVG. The whole-page "No health data found for this range." empty state is REMOVED.

- [ ] **Step 1: Rewrite the test file (failing)**

Replace the entire contents of `packages/core/src/report/render.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { renderDashboard } from "./render.js";

function day(date: string, steps?: number) {
  return { date, ...(steps === undefined ? {} : { steps: { total: steps } }) };
}

const GEN = "2026-07-02T00:00:00.000Z";

describe("renderDashboard", () => {
  it("sums steps into a tile and renders a chart", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 1000), day("2026-06-26", 2500)],
      generatedAt: GEN,
      types: ["steps"],
    });
    expect(html).toContain("3,500");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Heart rate"); // type not enabled -> not rendered
    expect(html).toContain("2026-06-25 – 2026-06-26");
  });

  it("always renders enabled metrics: dash tile + no-data chart placeholder", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 1000), day("2026-06-26", 2500)],
      generatedAt: GEN,
      types: ["steps", "resting-heart-rate"],
    });
    expect(html).toContain("Resting heart rate");
    expect(html).toContain("—");
    expect(html).toContain("No data in this range");
    expect(html.match(/<svg/g)).toHaveLength(1); // only steps has a real chart
  });

  it("renders a true zero as 0, not a dash", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 0), day("2026-06-26", 0)],
      generatedAt: GEN,
      types: ["steps"],
    });
    expect(html).toContain(">0<");
    expect(html).not.toContain("—");
  });

  it("renders the new metrics from canonical fields", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        {
          date: "2026-06-25",
          calories: { total: 2100 },
          restingHeartRate: { bpm: 55 },
          heartRateVariability: { rmssdMs: 48.5 },
          respiratoryRate: { breathsPerMinute: 14.2 },
        },
        { date: "2026-06-26" },
      ],
      generatedAt: GEN,
      types: ["calories", "resting-heart-rate", "heart-rate-variability", "respiratory-rate"],
    });
    expect(html).toContain("Calories");
    expect(html).toContain("2,100");
    expect(html).toContain("55");
    expect(html).toContain("48.5");
    expect(html).toContain("14.2");
  });

  it("breaks the line at missing days instead of bridging the gap", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        day("2026-06-25", 1000),
        day("2026-06-26"),
        day("2026-06-27", 3000),
        day("2026-06-28", 2000),
      ],
      generatedAt: GEN,
      types: ["steps"],
    });
    expect(html.match(/<polyline/g)).toHaveLength(1);
    expect(html.match(/<circle/g)).toHaveLength(3);
  });

  it("day range renders tiles only, no chart and no placeholder", () => {
    const html = renderDashboard({
      range: "day",
      days: [day("2026-07-01", 4321)],
      generatedAt: GEN,
      types: ["steps", "sleep"],
    });
    expect(html).toContain("4,321");
    expect(html).toContain("Sleep");
    expect(html).toContain("—"); // sleep has no data -> dash tile
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("No data in this range");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @healthsync/core exec vitest run src/report/render.test.ts`
Expected: FAIL — `types` not in `RenderDashboardParams`, dash/placeholder behavior missing.

- [ ] **Step 3: Implement**

In `packages/core/src/report/render.ts`:

1. Add import: `import type { DataType } from "../config/index.js";`
2. `RenderDashboardParams` gains `types: DataType[];` (required), documented as "enabled data types — metrics for other types are not rendered".
3. `MetricSpec` gains `type: DataType;`. Replace `METRICS` with the nine entries in this exact order:

```ts
const METRICS: MetricSpec[] = [
  { type: "steps", label: "Steps", unit: "", agg: "sum", decimals: 0, extract: (d) => d.steps?.total },
  { type: "calories", label: "Calories", unit: "kcal", agg: "sum", decimals: 0, extract: (d) => d.calories?.total },
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
  { type: "spo2", label: "SpO2", unit: "%", agg: "avg", decimals: 1, extract: (d) => d.spo2?.averageOvernight },
];
```

(Biome will wrap the one-liners; let `biome format` decide.)

4. Replace the metric loop and the `content` assembly in `renderDashboard` with:

```ts
  const tiles: string[] = [];
  const charts: string[] = [];
  for (const m of METRICS.filter((metric) => p.types.includes(metric.type))) {
    const values = p.days.map((d) => m.extract(d));
    const present = values.filter((v): v is number => v !== undefined);
    const total = present.reduce((a, b) => a + b, 0);
    const suffix = m.agg === "avg" && p.range !== "day" ? " (avg)" : "";
    const unit = m.unit ? `<span class="unit">${m.unit}</span>` : "";
    const value =
      present.length === 0
        ? "—"
        : `${fmt(m.agg === "sum" ? total : total / present.length, m.decimals)}${unit}`;
    tiles.push(
      `<div class="tile"><div class="label">${m.label}${suffix}</div><div class="value">${value}</div></div>`,
    );
    if (p.days.length > 1) {
      const title = m.unit ? `${m.label} (${m.unit})` : m.label;
      const body =
        present.length === 0
          ? `<p class="no-data">No data in this range</p>`
          : lineChart(
              values,
              p.days.map((d) => d.date),
              m.decimals,
            );
      charts.push(`<section><h2>${title}</h2>${body}</section>`);
    }
  }

  const content = `<div class="tiles">${tiles.join("")}</div>\n${charts.join("\n")}`;
```

(The old `tiles.length === 0 ? "No health data found..." : ...` ternary is deleted.)

5. Add one CSS rule to `STYLE` (after the `section h2` rule):

```
.no-data{color:var(--muted);font-size:.9rem;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:1rem;margin:0}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @healthsync/core exec vitest run src/report/render.test.ts`
Expected: PASS (6 tests). NOTE: `src/report/run.test.ts` will now FAIL to compile (`renderDashboard` call in `run.ts` lacks `types`) — quick-fix `run.ts` in this task by adding `types: p.types,` to its `renderDashboard({...})` call (one line; Task 5 rewrites that area anyway). Then run `pnpm --filter @healthsync/core test` — all PASS.

- [ ] **Step 5: Format check and commit**

```bash
node_modules/.bin/biome check packages/core/src/report
git add packages/core/src/report/
git commit -m "feat(core): always render enabled metrics with dash/no-data states"
```

---

### Task 5: Orchestrator per-type backfill

**Files:**
- Modify: `packages/core/src/report/run.ts`
- Test: `packages/core/src/report/run.test.ts`

**Interfaces:**
- Consumes: Task 4's `renderDashboard` (`types` already passed). Existing non-rewind state wrapper and per-file try/catch in `run.ts` MUST be preserved.
- Produces: for each date, `runSync` is called with ONLY the enabled types missing a `<date>_<type>.json` file in Drive; dates missing nothing are skipped. `RunDashboardResult` shape unchanged (`syncedDates` = dates where at least one type was fetched).

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/report/run.test.ts` (reuse the existing `makeDrive`/`state`/`rawSteps` helpers):

```ts
  it("backfills only the missing types for a partially-synced date", async () => {
    const drive = makeDrive({ "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 500)] });
    const health = {
      fetch: vi.fn(
        async ({ type, startTime, endTime }: { type: string; startTime: string; endTime: string }) => ({
          type,
          startTime,
          endTime,
          points: [{ dailyRestingHeartRate: { beatsPerMinute: 55 } }],
        }),
      ),
    };
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps", "resting-heart-rate"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(health.fetch).toHaveBeenCalledTimes(1);
    expect(health.fetch).toHaveBeenCalledWith(expect.objectContaining({ type: "resting-heart-rate" }));
    expect(result.syncedDates).toEqual(["2026-07-01"]);
    expect(result.html).toContain("Resting heart rate");
    expect(result.html).toContain("500"); // steps read back from the seeded file
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @healthsync/core exec vitest run src/report/run.test.ts`
Expected: FAIL — `health.fetch` called 0 times (old any-file-skips-date logic) or called for steps too.

- [ ] **Step 3: Implement**

In `packages/core/src/report/run.ts`, replace the `hasRaw` helper and the sync loop's skip logic:

Old:

```ts
  const hasRaw = (date: string) =>
    (filesByMonth.get(ymOf(date)) ?? []).some((f) => f.name.startsWith(`${date}_`));
```

New:

```ts
  const missingTypesFor = (date: string): DataType[] => {
    const files = filesByMonth.get(ymOf(date)) ?? [];
    return p.types.filter((t) => !files.some((f) => f.name === `${date}_${t}.json`));
  };
```

(add `DataType` to the existing import from `../config/index.js`).

In the loop, replace `if (hasRaw(date)) continue;` and the `runSync` call:

```ts
  for (const date of dates) {
    const missingTypes = missingTypesFor(date);
    if (missingTypes.length === 0) continue;
    const nextMidnight = new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS);
    const res = await runSync({
      health: p.health,
      drive: p.drive,
      state: guardedState, // keep the existing non-rewind wrapper variable name as found in the file
      types: missingTypes,
      driveRoot: p.driveRoot,
      now: nextMidnight,
    });
    syncedDates.push(date);
    for (const r of Object.values(res.perType)) {
      if (r.status === "error") errors.push({ date, type: r.type, error: r.error ?? "unknown" });
    }
  }
```

IMPORTANT: read the current file first — the state wrapper variable and the per-file try/catch from commit efbee44 must survive this edit; only the skip condition and `types:` argument change.

- [ ] **Step 4: Run the core suite, then build + CLI + typecheck**

```bash
pnpm --filter @healthsync/core test
pnpm build
pnpm --filter @healthsync/cli test
pnpm typecheck
```

Expected: all PASS. (The existing run.test cases pass `types: ["steps"]`, so their skip expectations are unchanged.)

- [ ] **Step 5: Format check and commit**

```bash
node_modules/.bin/biome check packages/core/src/report
git add packages/core/src/report/
git commit -m "feat(core): per-type backfill so new data types populate old days"
```

---

### Task 6: README + full verification + sample render

**Files:**
- Modify: `README.md`

**Interfaces:** none — docs and final gate.

- [ ] **Step 1: Update README**

1. In the Configuration section's example JSON, replace the `dataTypes` array with all nine:

```json
  "dataTypes": ["steps", "calories", "heart-rate", "resting-heart-rate", "heart-rate-variability", "respiratory-rate", "sleep", "active-zone-minutes", "spo2"]
```

2. In the dashboard bullet under "Drive layout produced", extend the description to mention that all enabled metrics always render ("—" when a range has no data) — one sentence, matching the existing bullet style.
3. In the OAuth consent-screen scopes list, no change is needed (the three existing readonly Health scopes cover the new types) — verify the README doesn't list per-type scopes; if it does, leave as-is.

- [ ] **Step 2: Full verification**

```bash
pnpm typecheck
node_modules/.bin/biome check .
pnpm build
pnpm test
```

Expected: all pass, biome 0 errors.

- [ ] **Step 3: Render-and-look check**

```bash
node --input-type=module -e "
import { renderDashboard } from './packages/core/dist/index.js';
import { writeFileSync } from 'node:fs';
const types = ['steps','calories','heart-rate','resting-heart-rate','heart-rate-variability','respiratory-rate','sleep','active-zone-minutes','spo2'];
const days = [];
for (let i = 7; i >= 1; i--) {
  const date = new Date(Date.UTC(2026, 5, 32 - i)).toISOString().slice(0, 10);
  days.push(i === 4 ? { date } : {
    date,
    steps: { total: 6000 + i * 900 },
    calories: { total: 1900 + i * 60 },
    heartRate: { average: 62 + (i % 3) },
    restingHeartRate: { bpm: 54 + (i % 2) },
    heartRateVariability: { rmssdMs: 42 + i },
    sleep: { durationMinutes: 400 + i * 10 },
    activeZoneMinutes: { total: 25 + i * 5 },
    spo2: { averageOvernight: 96 + (i % 2) },
  });
}
writeFileSync('/tmp/claude-1000/-home-andy-project-HealthSync/74dee672-6079-4d3f-b254-b3f4b5872f2c/scratchpad/dashboard-v2-sample.html',
  renderDashboard({ range: 'week', days, generatedAt: '2026-07-03T00:00:00.000Z', types }));
console.log('written');
"
```

Note: `respiratoryRate` is deliberately omitted from every fixture day — verify structurally that its tile shows `—` and its section shows "No data in this range", while the other 8 metrics have real tiles and charts (8 `<svg>`, each split into 2 polylines by the missing day, no `NaN`, coordinates within the 640x200 viewBox). Leave the file in place for the controller.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document v2 dashboard metrics and data types"
```
