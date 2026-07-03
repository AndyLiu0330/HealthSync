# HealthSync Dashboard (Static Report) — Design

Date: 2026-07-02
Status: Approved (brainstorming session)

## Goal

Give the user a visual dashboard of their health data without adding a server
or web app: a new CLI command syncs a chosen range, then renders a
self-contained `dashboard.html` from the freshly synced data.

## CLI interface

```bash
healthsync dashboard --range day|week|month   # default: week
```

Flow, in order:

1. Run the existing sync pipeline for the chosen range (writes `raw/` +
   `daily/` to Drive as today).
2. Read back the raw JSON for that range from Drive `raw/` (single source of
   truth; no separate Health API fetch for display).
3. Render a single self-contained `dashboard.html`.
4. Save it locally, upload a copy to Drive, and open it in the browser.

The existing `sync` command is unchanged.

## Output

- One self-contained `dashboard.html` — all CSS/JS/SVG inlined, no external
  resources, viewable offline.
- Local copy at the platform data dir (e.g.
  `~/.local/share/healthsync/dashboard.html`), auto-opened in the default
  browser after generation.
- Uploaded to Drive at `HealthSync/dashboard.html`, overwritten on each run,
  so it is viewable from other devices.

## Content

- **Summary tiles** (top): totals/averages for the selected range — total
  steps, average heart rate, average sleep hours, AZM, SpO2. Driven by the
  configured `dataTypes`; metrics not configured or not returned are simply
  omitted.
- **Trend charts** (below, one per metric):
  - `day`: intraday curve for that day (e.g. heart rate over the day).
  - `week` / `month`: one data point per day, line chart.
  - Rendered as inline SVG. No frontend framework, no chart library.

## Code placement

- `packages/core/src/report/` — report renderer: takes transformed data for a
  range, returns the HTML string. Sibling to the existing `transform/` module
  (which produces Markdown daily notes).
- `packages/cli/src/commands/dashboard.ts` — composes sync → read range data →
  render HTML → save/upload → open browser.

## Error handling

- No stored token → reuse the existing error path that directs the user to
  `healthsync connect`.
- Missing data for a day/metric → gap in the chart, omitted tile; never a
  crash or aborted run.

## Testing

- Core report renderer: vitest tests asserting that given fixture data the
  HTML contains the correct summary numbers and SVG points (snapshot or
  targeted asserts), including gap handling.
- CLI command: follow the existing command-test pattern in `packages/cli`.

## Out of scope (deliberate)

Interactive filtering, custom date ranges, dark mode, chart libraries, hover
tooltips, any localhost server. Revisit if/when static SVG stops being enough.
