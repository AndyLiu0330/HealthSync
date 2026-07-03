# HealthSync Dashboard (Static Report) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `healthsync dashboard --range day|week|month` that syncs missing days in the range to Drive, then renders a self-contained `dashboard.html` (summary tiles + SVG line charts), saves it locally, uploads it to Drive, and opens it in the browser.

**Architecture:** A pure HTML renderer (`packages/core/src/report/render.ts`) and an orchestrator (`packages/core/src/report/run.ts`) that reuses the existing `runSync` per missing day and reads data back from Drive `raw/` JSON archives. The CLI adds one thin command that wires ports, saves the file, and opens the browser — same dependency-injection pattern as the existing `sync` command.

**Tech Stack:** TypeScript ESM (NodeNext — all relative imports need `.js` suffix), commander, vitest, nock (Drive client tests), biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-02-dashboard-design.md`

## Global Constraints

- Node 22, pnpm workspace. Run all commands from the repo root (the worktree root).
- **No new dependencies** in any package.json.
- All relative imports must end in `.js` (NodeNext ESM), e.g. `from "./render.js"`.
- Formatting/linting is biome: 2-space indent, double quotes, semicolons. Run `pnpm lint` before each commit; fix with `pnpm format` if needed.
- Test files are colocated: `foo.test.ts` next to `foo.ts` (CLI and core src). Run a single package's tests with `pnpm --filter @healthsync/core test` / `pnpm --filter @healthsync/cli test`, or one file with `pnpm --filter @healthsync/core exec vitest run src/report/render.test.ts`.
- `@healthsync/cli` imports core types/functions from `@healthsync/core` (the package, never deep paths). The CLI package resolves core from `packages/core/dist`, so **run `pnpm build` before running CLI tests whenever core's public API changed**.
- Dates are UTC everywhere; "a day" is a full UTC day `YYYY-MM-DD`. The most recent day shown/synced is *yesterday* relative to `now` (matching existing `runSync` semantics).
- Commit after every task with the message given in the task.

---

### Task 1: DriveClient — `downloadJSON` + `uploadHTML`

**Files:**
- Modify: `packages/core/src/google-drive/index.ts`
- Test: `packages/core/src/google-drive/index.test.ts`

**Interfaces:**
- Consumes: existing `DriveClient` (googleapis `drive_v3`), `NetworkError` from `../errors/index.js`.
- Produces (used by Task 3 and the CLI):
  - `DriveClient.downloadJSON(fileId: string): Promise<unknown>` — downloads a Drive file's content (`alt: "media"`) and returns it parsed as JSON.
  - `DriveClient.uploadHTML(p: { parentId: string; name: string; body: string; overwriteFileId?: string }): Promise<string>` — like `uploadMarkdown` but `mimeType: "text/html"`; returns the file id.

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("DriveClient", ...)` block in `packages/core/src/google-drive/index.test.ts`:

```ts
  it("downloadJSON fetches file content with alt=media and parses it", async () => {
    const api = nock("https://www.googleapis.com");
    api
      .get("/drive/v3/files/file-9")
      .query((q) => q.alt === "media")
      .reply(200, { type: "steps", startTime: "2026-07-01T00:00:00.000Z", points: [] });

    const client = new DriveClient(fakeAuth());
    const body = (await client.downloadJSON("file-9")) as { type: string };
    expect(body.type).toBe("steps");
  });

  it("uploadHTML writes multipart body and returns the file id", async () => {
    const api = nock("https://www.googleapis.com");
    api
      .post("/upload/drive/v3/files")
      .query((q) => q.uploadType === "multipart")
      .reply(200, { id: "html-1", name: "dashboard.html" });

    const client = new DriveClient(fakeAuth());
    const id = await client.uploadHTML({
      parentId: "root-id",
      name: "dashboard.html",
      body: "<!doctype html><html></html>",
    });
    expect(id).toBe("html-1");
  });

  it("uploadHTML with overwriteFileId sends update and returns the same id", async () => {
    const api = nock("https://www.googleapis.com");
    api.patch("/upload/drive/v3/files/html-1").query(true).reply(200, { id: "html-1" });

    const client = new DriveClient(fakeAuth());
    const id = await client.uploadHTML({
      parentId: "root-id",
      name: "dashboard.html",
      body: "<!doctype html><html></html>",
      overwriteFileId: "html-1",
    });
    expect(id).toBe("html-1");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @healthsync/core exec vitest run src/google-drive/index.test.ts`
Expected: FAIL — `downloadJSON is not a function` / `uploadHTML is not a function`.

- [ ] **Step 3: Implement**

In `packages/core/src/google-drive/index.ts`:

Add after the `UploadMarkdownParams` interface:

```ts
export interface UploadHTMLParams {
  parentId: string;
  name: string;
  body: string;
  overwriteFileId?: string;
}
```

Inside the `DriveClient` class, refactor the duplicated upload logic into one private helper and add the two new methods. Replace the bodies of `uploadJSON` and `uploadMarkdown` to delegate:

```ts
  async uploadJSON(p: UploadJSONParams): Promise<string> {
    return this.uploadFile(p, {
      mimeType: "application/json",
      body: JSON.stringify(p.body, null, 2),
    });
  }

  async uploadMarkdown(p: UploadMarkdownParams): Promise<string> {
    return this.uploadFile(p, { mimeType: "text/markdown", body: p.body });
  }

  async uploadHTML(p: UploadHTMLParams): Promise<string> {
    return this.uploadFile(p, { mimeType: "text/html", body: p.body });
  }

  async downloadJSON(fileId: string): Promise<unknown> {
    const res = await this.drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
    const data: unknown = res.data;
    return typeof data === "string" ? JSON.parse(data) : data;
  }

  private async uploadFile(
    p: { parentId: string; name: string; overwriteFileId?: string },
    media: { mimeType: string; body: string },
  ): Promise<string> {
    if (p.overwriteFileId) {
      const res = await this.drive.files.update({
        fileId: p.overwriteFileId,
        media,
        fields: "id",
      });
      if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
      return res.data.id;
    }
    const res = await this.drive.files.create({
      requestBody: { name: p.name, parents: [p.parentId] },
      media,
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
    return res.data.id;
  }
```

(Delete the old duplicated bodies of `uploadJSON` / `uploadMarkdown` — the existing tests for them must still pass unchanged.)

- [ ] **Step 4: Run the package tests**

Run: `pnpm --filter @healthsync/core test`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/core/src/google-drive/
git commit -m "feat(core): add DriveClient.downloadJSON and uploadHTML"
```

---

### Task 2: `renderDashboard` — pure HTML renderer

**Files:**
- Create: `packages/core/src/report/render.ts`
- Test: `packages/core/src/report/render.test.ts`

**Interfaces:**
- Consumes: `CanonicalDay` from `../transform/json/index.js` (fields: `date: string`, optional `steps.total`, `heartRate.average|resting`, `sleep.durationMinutes`, `activeZoneMinutes.total`, `spo2.averageOvernight`).
- Produces (used by Task 3):
  - `export type DashboardRange = "day" | "week" | "month";`
  - `export interface RenderDashboardParams { range: DashboardRange; days: CanonicalDay[]; generatedAt: string; }` — `days` has one entry per date in the range, ascending; a day with no data is `{ date }` only.
  - `export function renderDashboard(p: RenderDashboardParams): string` — deterministic, pure; returns the full HTML document.

Rendering rules (from the spec + dataviz review):
- Summary tiles: Steps (sum), Heart rate (avg, bpm), Sleep (avg, hours = durationMinutes/60, 1 decimal), Active zone minutes (sum), SpO2 (avg, %, 1 decimal). A metric with no data on any day is omitted entirely.
- Charts only when `days.length > 1` (so `day` range = tiles only). One single-series SVG line chart per present metric; missing days break the polyline into segments (never bridge a gap). Dots `r=4` with a 2px surface-color ring and a native `<title>` tooltip (`YYYY-MM-DD: value`).
- Colors via CSS custom properties with a dark mode `@media (prefers-color-scheme: dark)` block. Series color light `#2a78d6` / dark `#3987e5`; all text uses ink tokens, never the series color.
- If no metric has data at all: render the page with `<p class="meta">No health data found for this range.</p>` instead of tiles/charts.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/report/render.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderDashboard } from "./render.js";

function day(date: string, steps?: number) {
  return { date, ...(steps === undefined ? {} : { steps: { total: steps } }) };
}

describe("renderDashboard", () => {
  it("sums steps across the range into a tile and renders a chart", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25", 1000), day("2026-06-26", 2500)],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("3,500");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Heart rate"); // metric with no data is omitted
    expect(html).toContain("2026-06-25 – 2026-06-26"); // range in title
  });

  it("averages avg-type metrics", () => {
    const html = renderDashboard({
      range: "week",
      days: [
        { date: "2026-06-25", heartRate: { average: 60 } },
        { date: "2026-06-26", heartRate: { average: 70 } },
      ],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("Heart rate");
    expect(html).toContain("65");
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
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    // lone point before the gap -> no polyline; the pair after -> exactly one
    expect(html.match(/<polyline/g)).toHaveLength(1);
    expect(html.match(/<circle/g)).toHaveLength(3);
  });

  it("day range renders tiles only, no chart", () => {
    const html = renderDashboard({
      range: "day",
      days: [day("2026-07-01", 4321)],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("4,321");
    expect(html).not.toContain("<svg");
  });

  it("renders an empty state when no metric has data", () => {
    const html = renderDashboard({
      range: "week",
      days: [day("2026-06-25"), day("2026-06-26")],
      generatedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(html).toContain("No health data found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @healthsync/core exec vitest run src/report/render.test.ts`
Expected: FAIL — cannot resolve `./render.js`.

- [ ] **Step 3: Implement**

Create `packages/core/src/report/render.ts`:

```ts
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
  const labels =
    levels
      .map(
        (v) =>
          `<text class="chart-text" x="${PAD_X - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmt(v, decimals)}</text>`,
      )
      .join("") +
    `<text class="chart-text" x="${PAD_X}" y="${H - 8}">${dates[0] ?? ""}</text>` +
    `<text class="chart-text" x="${W - PAD_X}" y="${H - 8}" text-anchor="end">${dates[dates.length - 1] ?? ""}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="daily trend">${grid}${segments.join("")}${dots}${labels}</svg>`;
}

function fmt(v: number, decimals: number): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
```

Note: no `escapeHtml` — every interpolated value is internally generated (dates `YYYY-MM-DD`, fixed labels, numbers, ISO timestamps); no user-controlled strings flow in.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @healthsync/core exec vitest run src/report/render.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/core/src/report/
git commit -m "feat(core): add renderDashboard static HTML report renderer"
```

---

### Task 3: `runDashboard` orchestrator + core exports

**Files:**
- Create: `packages/core/src/report/run.ts`
- Test: `packages/core/src/report/run.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `runSync`, `HealthPort`, `DrivePort`, `StatePort` from `../sync/index.js`; `toCanonical`, `mergeCanonical`, `CanonicalDay` from `../transform/json/index.js`; `DataTypeResult` from `../google-health/types.js`; `SUPPORTED_DATA_TYPES`, `DataType` from `../config/index.js`; `renderDashboard`, `DashboardRange` from `./render.js`. Task 1's `DriveClient` satisfies `DashboardDrivePort` structurally.
- Produces (used by Task 4):

```ts
export interface DashboardDrivePort extends DrivePort {
  findChild(parentId: string, name: string): Promise<string | null>;
  downloadJSON(fileId: string): Promise<unknown>;
  uploadHTML(p: {
    parentId: string;
    name: string;
    body: string;
    overwriteFileId?: string;
  }): Promise<string>;
}

export interface RunDashboardParams {
  health: HealthPort;
  drive: DashboardDrivePort;
  state: StatePort;
  types: DataType[];
  driveRoot: string;
  now: Date;
  range: DashboardRange;
}

export interface RunDashboardResult {
  dates: string[]; // range covered, ascending
  syncedDates: string[]; // dates freshly synced this run
  errors: Array<{ date: string; type: string; error: string }>; // per-type sync failures
  html: string;
  driveFileId: string;
}

export async function runDashboard(p: RunDashboardParams): Promise<RunDashboardResult>;
```

Behavior:
1. Range = last N full UTC days ending yesterday relative to `now` (N: day=1, week=7, month=30).
2. List each covered `raw/YYYY/MM` Drive folder once. A date counts as synced if any file named `<date>_*` exists.
3. For each unsynced date, call `runSync` with `now` = that date's *next* UTC midnight (this makes `runSync` fetch exactly that day and key files by it). Collect per-type errors from the result; `runSync` never throws for per-type failures.
4. Re-list the month folders if anything was synced, then for every date in range: download all `<date>_<type>.json` files, guard-parse each as `DataTypeResult`, `toCanonical` + `mergeCanonical` them into one `CanonicalDay` (a date with no files becomes `{ date }`).
5. `renderDashboard`, then upload as `<driveRoot>/dashboard.html` — `findChild` first so an existing file is overwritten via `overwriteFileId`, not duplicated.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/src/report/run.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { runDashboard } from "./run.js";

type FileEntry = { id: string; name: string };

function makeDrive(seed: Record<string, Array<{ name: string; body: unknown }>> = {}) {
  const folders = new Map<string, FileEntry[]>();
  const bodies = new Map<string, unknown>();
  let nextId = 1;
  for (const [folder, files] of Object.entries(seed)) {
    const entries: FileEntry[] = [];
    for (const f of files) {
      const id = `seed-${nextId++}`;
      entries.push({ id, name: f.name });
      bodies.set(id, f.body);
    }
    folders.set(folder, entries);
  }
  const uploadedHTML: Array<{ parentId: string; name: string; body: string; overwriteFileId?: string }> = [];
  return {
    uploadedHTML,
    ensureFolderPath: vi.fn(async (segments: string[]) => {
      const key = segments.join("/");
      if (!folders.has(key)) folders.set(key, []);
      return key;
    }),
    listChildren: vi.fn(async (parentId: string) => folders.get(parentId) ?? []),
    downloadJSON: vi.fn(async (fileId: string) => bodies.get(fileId)),
    uploadJSON: vi.fn(async (p: { parentId: string; name: string; body: unknown }) => {
      const id = `up-${nextId++}`;
      folders.get(p.parentId)?.push({ id, name: p.name });
      bodies.set(id, p.body);
      return id;
    }),
    uploadMarkdown: vi.fn(async () => `md-${nextId++}`),
    uploadHTML: vi.fn(
      async (p: { parentId: string; name: string; body: string; overwriteFileId?: string }) => {
        uploadedHTML.push(p);
        return p.overwriteFileId ?? "dash-1";
      },
    ),
    findChild: vi.fn(async () => null),
  };
}

function makeHealth(stepsPerDay: number) {
  return {
    fetch: vi.fn(async ({ type, startTime, endTime }: { type: string; startTime: string; endTime: string }) => ({
      type,
      startTime,
      endTime,
      points: [{ steps: { count: stepsPerDay } }],
    })),
  };
}

const state = () => ({
  get: vi.fn(async () => ({ lastSync: {} })),
  setType: vi.fn(async () => {}),
});

function rawSteps(date: string, count: number) {
  return {
    name: `${date}_steps.json`,
    body: {
      type: "steps",
      startTime: `${date}T00:00:00.000Z`,
      endTime: `${date}T23:59:59.000Z`,
      points: [{ steps: { count } }],
    },
  };
}

describe("runDashboard", () => {
  it("day range with empty Drive: syncs yesterday, reads it back, uploads dashboard.html", async () => {
    const drive = makeDrive();
    const health = makeHealth(4321);
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(result.dates).toEqual(["2026-07-01"]);
    expect(result.syncedDates).toEqual(["2026-07-01"]);
    expect(result.errors).toEqual([]);
    expect(health.fetch).toHaveBeenCalledTimes(1);
    expect(result.html).toContain("4,321");
    expect(drive.uploadedHTML[0]?.parentId).toBe("HealthSync");
    expect(drive.uploadedHTML[0]?.name).toBe("dashboard.html");
    expect(result.driveFileId).toBe("dash-1");
  });

  it("skips days that already have raw files (no duplicate sync)", async () => {
    const drive = makeDrive({
      "HealthSync/raw/2026/06": [rawSteps("2026-06-30", 1000)],
      "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 2000)],
    });
    const health = makeHealth(0);
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "week",
    });
    expect(result.dates).toHaveLength(7);
    expect(result.dates[0]).toBe("2026-06-25");
    expect(result.dates[6]).toBe("2026-07-01");
    // 5 of 7 days missing -> 5 sync fetches; the 2 seeded days are not re-synced
    expect(result.syncedDates).toHaveLength(5);
    expect(result.syncedDates).not.toContain("2026-06-30");
    expect(result.syncedDates).not.toContain("2026-07-01");
    expect(result.html).toContain("<svg");
  });

  it("overwrites an existing dashboard.html instead of duplicating it", async () => {
    const drive = makeDrive({ "HealthSync/raw/2026/07": [rawSteps("2026-07-01", 500)] });
    drive.findChild.mockResolvedValue("dash-old");
    const result = await runDashboard({
      health: makeHealth(0),
      drive: drive as never,
      state: state(),
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(drive.uploadedHTML[0]?.overwriteFileId).toBe("dash-old");
    expect(result.driveFileId).toBe("dash-old");
  });

  it("collects per-type sync errors without aborting", async () => {
    const drive = makeDrive();
    const health = {
      fetch: vi.fn(async ({ type, startTime, endTime }: { type: string; startTime: string; endTime: string }) => {
        if (type === "sleep") throw new Error("boom");
        return { type, startTime, endTime, points: [{ steps: { count: 1 } }] };
      }),
    };
    const result = await runDashboard({
      health,
      drive: drive as never,
      state: state(),
      types: ["steps", "sleep"],
      driveRoot: "HealthSync",
      now: new Date("2026-07-02T10:00:00Z"),
      range: "day",
    });
    expect(result.errors).toEqual([{ date: "2026-07-01", type: "sleep", error: "boom" }]);
    expect(result.html).toContain("Steps");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @healthsync/core exec vitest run src/report/run.test.ts`
Expected: FAIL — cannot resolve `./run.js`.

- [ ] **Step 3: Implement**

Create `packages/core/src/report/run.ts`:

```ts
import { type DataType, SUPPORTED_DATA_TYPES } from "../config/index.js";
import type { DataTypeResult } from "../google-health/types.js";
import { type DrivePort, type HealthPort, type StatePort, runSync } from "../sync/index.js";
import { type CanonicalDay, mergeCanonical, toCanonical } from "../transform/json/index.js";
import { type DashboardRange, renderDashboard } from "./render.js";

export interface DashboardDrivePort extends DrivePort {
  findChild(parentId: string, name: string): Promise<string | null>;
  downloadJSON(fileId: string): Promise<unknown>;
  uploadHTML(p: {
    parentId: string;
    name: string;
    body: string;
    overwriteFileId?: string;
  }): Promise<string>;
}

export interface RunDashboardParams {
  health: HealthPort;
  drive: DashboardDrivePort;
  state: StatePort;
  types: DataType[];
  driveRoot: string;
  now: Date;
  range: DashboardRange;
}

export interface RunDashboardResult {
  dates: string[];
  syncedDates: string[];
  errors: Array<{ date: string; type: string; error: string }>;
  html: string;
  driveFileId: string;
}

const RANGE_DAYS: Record<DashboardRange, number> = { day: 1, week: 7, month: 30 };
const DAY_MS = 86_400_000;

export async function runDashboard(p: RunDashboardParams): Promise<RunDashboardResult> {
  const dates = lastFullDays(p.now, RANGE_DAYS[p.range]);

  // One Drive folder id + listing per calendar month covered by the range.
  const monthFolders = new Map<string, string>(); // "YYYY/MM" -> folderId
  for (const date of dates) {
    const ym = ymOf(date);
    if (!monthFolders.has(ym)) {
      const [y, m] = ym.split("/") as [string, string];
      monthFolders.set(ym, await p.drive.ensureFolderPath([p.driveRoot, "raw", y, m]));
    }
  }
  const listMonths = async (): Promise<Map<string, Array<{ id: string; name: string }>>> => {
    const byMonth = new Map<string, Array<{ id: string; name: string }>>();
    for (const [ym, folderId] of monthFolders) {
      byMonth.set(ym, await p.drive.listChildren(folderId));
    }
    return byMonth;
  };

  let filesByMonth = await listMonths();
  const hasRaw = (date: string) =>
    (filesByMonth.get(ymOf(date)) ?? []).some((f) => f.name.startsWith(`${date}_`));

  const syncedDates: string[] = [];
  const errors: RunDashboardResult["errors"] = [];
  for (const date of dates) {
    if (hasRaw(date)) continue;
    const nextMidnight = new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS);
    const res = await runSync({
      health: p.health,
      drive: p.drive,
      state: p.state,
      types: p.types,
      driveRoot: p.driveRoot,
      now: nextMidnight,
    });
    syncedDates.push(date);
    for (const r of Object.values(res.perType)) {
      if (r.status === "error") errors.push({ date, type: r.type, error: r.error ?? "unknown" });
    }
  }
  if (syncedDates.length > 0) filesByMonth = await listMonths();

  const days: CanonicalDay[] = [];
  for (const date of dates) {
    const files = (filesByMonth.get(ymOf(date)) ?? []).filter(
      (f) => f.name.startsWith(`${date}_`) && f.name.endsWith(".json"),
    );
    const canonical: CanonicalDay[] = [];
    for (const f of files) {
      const body = await p.drive.downloadJSON(f.id);
      if (isDataTypeResult(body)) canonical.push(toCanonical(body));
    }
    days.push(canonical.length > 0 ? mergeCanonical(canonical) : { date });
  }

  const html = renderDashboard({ range: p.range, days, generatedAt: p.now.toISOString() });
  const rootId = await p.drive.ensureFolderPath([p.driveRoot]);
  const existing = await p.drive.findChild(rootId, "dashboard.html");
  const driveFileId = await p.drive.uploadHTML({
    parentId: rootId,
    name: "dashboard.html",
    body: html,
    ...(existing ? { overwriteFileId: existing } : {}),
  });

  return { dates, syncedDates, errors, html, driveFileId };
}

function lastFullDays(now: Date, n: number): string[] {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dates: string[] = [];
  for (let i = n; i >= 1; i--) {
    dates.push(new Date(todayUtc - i * DAY_MS).toISOString().slice(0, 10));
  }
  return dates;
}

function ymOf(date: string): string {
  return `${date.slice(0, 4)}/${date.slice(5, 7)}`;
}

function isDataTypeResult(v: unknown): v is DataTypeResult {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.type === "string" &&
    (SUPPORTED_DATA_TYPES as readonly string[]).includes(o.type) &&
    typeof o.startTime === "string" &&
    typeof o.endTime === "string" &&
    Array.isArray(o.points)
  );
}
```

Then add the report exports to `packages/core/src/index.ts`, after the existing `runSync` export block:

```ts
export {
  renderDashboard,
  type DashboardRange,
  type RenderDashboardParams,
} from "./report/render.js";
export {
  runDashboard,
  type DashboardDrivePort,
  type RunDashboardParams,
  type RunDashboardResult,
} from "./report/run.js";
```

- [ ] **Step 4: Run the package tests**

Run: `pnpm --filter @healthsync/core test`
Expected: PASS (all existing + new).

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/core/src/report/ packages/core/src/index.ts
git commit -m "feat(core): add runDashboard range-sync + report orchestrator"
```

---

### Task 4: CLI `dashboard` command

**Files:**
- Create: `packages/cli/src/commands/dashboard.ts`
- Test: `packages/cli/src/commands/dashboard.test.ts`
- Modify: `packages/cli/src/paths.ts` (add `dashboardPath()`)
- Modify: `packages/cli/src/index.ts` (register the command)

**Interfaces:**
- Consumes (from Task 3, via `@healthsync/core`): `runDashboard`, `RunDashboardParams`, `RunDashboardResult`, `DashboardDrivePort`, plus existing `DataType`, `HealthPort`, `StatePort`. **Core must be rebuilt first: run `pnpm build` before CLI tests.**
- Produces: `buildDashboardCommand(deps: DashboardDeps): Command` registered as `healthsync dashboard`.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/commands/dashboard.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { buildDashboardCommand } from "./dashboard.js";

function makeDeps() {
  const out: string[] = [];
  const result = {
    dates: ["2026-06-25", "2026-07-01"],
    syncedDates: ["2026-07-01"],
    errors: [{ date: "2026-07-01", type: "sleep", error: "boom" }],
    html: "<!doctype html><html></html>",
    driveFileId: "dash-1",
  };
  return {
    out,
    runDashboard: vi.fn(async () => result),
    deps: {
      buildDeps: vi.fn(async () => ({
        health: {} as never,
        drive: {} as never,
        state: {} as never,
        driveRoot: "HealthSync",
        types: ["steps"] as never,
      })),
      saveLocal: vi.fn(async () => "/home/u/.config/healthsync/dashboard.html"),
      openBrowser: vi.fn(async () => {}),
      writeLine: (s: string) => out.push(s),
      now: () => new Date("2026-07-02T10:00:00Z"),
    },
  };
}

describe("dashboard command", () => {
  it("runs the range, saves locally, opens the browser, reports errors", async () => {
    const { out, runDashboard, deps } = makeDeps();
    const cmd = buildDashboardCommand({ ...deps, runDashboard });
    await cmd.parseAsync(["node", "healthsync", "--range", "day"]);

    expect(runDashboard).toHaveBeenCalledWith(expect.objectContaining({ range: "day" }));
    expect(deps.saveLocal).toHaveBeenCalledWith("<!doctype html><html></html>");
    expect(deps.openBrowser).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/.*dashboard\.html$/),
    );
    expect(out.join("\n")).toContain("2026-06-25 .. 2026-07-01");
    expect(out.join("\n")).toContain("sleep");
  });

  it("defaults to week", async () => {
    const { runDashboard, deps } = makeDeps();
    const cmd = buildDashboardCommand({ ...deps, runDashboard });
    await cmd.parseAsync(["node", "healthsync"]);
    expect(runDashboard).toHaveBeenCalledWith(expect.objectContaining({ range: "week" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @healthsync/cli exec vitest run src/commands/dashboard.test.ts`
Expected: FAIL — cannot resolve `./dashboard.js`.

- [ ] **Step 3: Implement the command**

Create `packages/cli/src/commands/dashboard.ts`:

```ts
import { pathToFileURL } from "node:url";
import type {
  DashboardDrivePort,
  DashboardRange,
  DataType,
  HealthPort,
  RunDashboardParams,
  RunDashboardResult,
  StatePort,
} from "@healthsync/core";
import { Command, Option } from "commander";

export interface DashboardDeps {
  buildDeps: () => Promise<{
    health: HealthPort;
    drive: DashboardDrivePort;
    state: StatePort;
    driveRoot: string;
    types: DataType[];
  }>;
  runDashboard: (p: RunDashboardParams) => Promise<RunDashboardResult>;
  saveLocal: (html: string) => Promise<string>; // returns the path written
  openBrowser: (url: string) => Promise<void>;
  writeLine: (s: string) => void;
  now: () => Date;
}

export function buildDashboardCommand(deps: DashboardDeps): Command {
  return new Command("dashboard")
    .description("Sync a date range and generate a static HTML dashboard")
    .addOption(
      new Option("--range <range>", "how far back to sync and display")
        .choices(["day", "week", "month"])
        .default("week"),
    )
    .action(async (opts: { range: DashboardRange }) => {
      const base = await deps.buildDeps();
      const result = await deps.runDashboard({ ...base, now: deps.now(), range: opts.range });

      const localPath = await deps.saveLocal(result.html);
      deps.writeLine(`Range: ${result.dates[0]} .. ${result.dates[result.dates.length - 1]}`);
      deps.writeLine(
        `Synced ${result.syncedDates.length} day(s), reused ${
          result.dates.length - result.syncedDates.length
        } already in Drive`,
      );
      for (const e of result.errors) {
        deps.writeLine(`  warning: ${e.date} ${e.type}: ${e.error}`);
      }
      deps.writeLine(`Dashboard: ${localPath}`);
      deps.writeLine(`Drive file id: ${result.driveFileId}`);
      await deps.openBrowser(pathToFileURL(localPath).href);
    });
}
```

Add to `packages/cli/src/paths.ts`:

```ts
export function dashboardPath(): string {
  return join(configDir(), "dashboard.html");
}
```

Wire into `packages/cli/src/index.ts`:

1. Extend the node imports at the top:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
```

2. Add `runDashboard` to the `@healthsync/core` import list.
3. Add `buildDashboardCommand` import: `import { buildDashboardCommand } from "./commands/dashboard.js";`
4. Add `dashboardPath` to the `./paths.js` import list.
5. Register the command after the `sync` command registration:

```ts
  program.addCommand(
    buildDashboardCommand({
      buildDeps: buildSyncDeps,
      runDashboard,
      saveLocal: async (html) => {
        const p = dashboardPath();
        await mkdir(dirname(p), { recursive: true });
        await writeFile(p, html, "utf8");
        return p;
      },
      openBrowser: (url) => openBrowser(url),
      writeLine: (s) => console.log(s),
      now: () => new Date(),
    }),
  );
```

`buildSyncDeps` already returns a `DriveClient`, which structurally satisfies `DashboardDrivePort` after Task 1 (it has `findChild`, `downloadJSON`, `uploadHTML`).

- [ ] **Step 4: Rebuild core, run CLI tests and typecheck**

```bash
pnpm build
pnpm --filter @healthsync/cli test
pnpm typecheck
```

Expected: all PASS.

- [ ] **Step 5: Lint and commit**

```bash
pnpm lint
git add packages/cli/src/
git commit -m "feat(cli): add dashboard command (range sync + static HTML report)"
```

---

### Task 5: README + full verification

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation and final gate.

- [ ] **Step 1: Document the command**

In `README.md`, in the `## Usage` section's command block (after the `healthsync sync` examples and before `config show` if present — keep it inside the existing fenced block style), add:

```bash
# Sync the last week (or day/month) and open a static HTML dashboard
healthsync dashboard --range week
```

And after the "Drive layout produced" tree, extend the layout list with one line:

```
├── dashboard.html
```

with the bullet:

```markdown
- `dashboard.html` - self-contained HTML dashboard (summary tiles + trend charts) regenerated by `healthsync dashboard`; also saved locally next to your config (e.g. `~/.config/healthsync/dashboard.html`).
```

(Adjust placement to match the actual README structure — the tree currently shows `raw/`, `daily/`, `.state/`.)

- [ ] **Step 2: Full verification**

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Expected: all pass, zero warnings from lint.

- [ ] **Step 3: Render-and-look check**

Generate a sample dashboard with fixture data and eyeball it (labels, overlaps, dark mode):

```bash
node --input-type=module -e "
import { renderDashboard } from './packages/core/dist/index.js';
import { writeFileSync } from 'node:fs';
const days = [];
for (let i = 7; i >= 1; i--) {
  const date = new Date(Date.UTC(2026, 5, 32 - i)).toISOString().slice(0, 10);
  days.push(i === 4 ? { date } : {
    date,
    steps: { total: 6000 + i * 900 },
    heartRate: { average: 62 + (i % 3) },
    sleep: { durationMinutes: 400 + i * 10 },
    activeZoneMinutes: { total: 25 + i * 5 },
    spo2: { averageOvernight: 96 + (i % 2) },
  });
}
writeFileSync('/tmp/claude-1000/-home-andy-project-HealthSync/74dee672-6079-4d3f-b254-b3f4b5872f2c/scratchpad/dashboard-sample.html',
  renderDashboard({ range: 'week', days, generatedAt: new Date().toISOString() }));
console.log('written');
"
```

Open/screenshot the file and confirm: tiles render, five charts, the missing day breaks each line, no text collisions.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document healthsync dashboard command"
```
