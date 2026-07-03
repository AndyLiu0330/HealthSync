# HealthSync Dashboard v2 — Complete Metrics — Design

Date: 2026-07-03
Status: Approved (brainstorming session)
Builds on: `2026-07-02-dashboard-design.md` (static dashboard, shipped in PR #3)

## Goal

1. The dashboard always shows every enabled metric — a metric with no data in
   the range shows "—", a true zero shows 0. Nothing is silently hidden.
2. Add four data types: resting heart rate, heart rate variability,
   respiratory rate, and calories.

## New data types

| Config key | Health API dataType | Kind | Filter field |
|---|---|---|---|
| `resting-heart-rate` | `daily-resting-heart-rate` | daily | `daily_resting_heart_rate` |
| `heart-rate-variability` | `daily-heart-rate-variability` | daily | `daily_heart_rate_variability` |
| `respiratory-rate` | `daily-respiratory-rate` | daily | `daily_respiratory_rate` |
| `calories` | `total-calories` | interval | `total_calories` |

- All four are covered by the already-granted OAuth scopes
  (`health_metrics_and_measurements` for the three daily types,
  `activity_and_fitness` for calories) — no re-consent needed.
- Added to `SUPPORTED_DATA_TYPES` and to `DEFAULT_CONFIG.dataTypes`.
- `CanonicalDay` gains: `restingHeartRate?: { bpm?: number }`,
  `heartRateVariability?: { rmssdMs?: number }`,
  `respiratoryRate?: { breathsPerMinute?: number }`,
  `calories?: { total?: number }`. `toCanonical` parses the v4 point shapes
  the same way existing types do (documented field first, tolerant fallback),
  and `mergeCanonical`/`hasPayload` cover the new fields.
- The Markdown daily note gains one small section per new type, following the
  existing `transform/markdown/sections/` pattern.

## Dashboard rendering (renderer changes)

- `renderDashboard` gains a `types: DataType[]` param (the user's configured
  types, passed by `runDashboard`). Nine metrics render in this order:
  Steps, Calories, Heart rate, Resting heart rate, HRV, Respiratory rate,
  Sleep, Active zone minutes, SpO2 — filtered to enabled types.
- **Tiles:** one per enabled metric, always rendered. Value formatting is
  unchanged; a range with no data for that metric shows "—" (em dash). A true
  0 renders as 0.
- **Charts:** one section per enabled metric, always rendered (week/month
  only; day stays tiles-only). No data at all in the range → the section body
  is a placeholder line "No data in this range" instead of an SVG. Partial
  data keeps the existing gap-breaking behavior.
- The old "No health data found for this range." whole-page empty state is
  removed — the always-rendered tiles/placeholders replace it.

## Per-type backfill (orchestrator change)

Old behavior: a date with *any* raw file is skipped entirely, so days synced
before v2 would never fetch the new types. New behavior: for each date,
compute the enabled types that have no `<date>_<type>.json` in Drive and call
`runSync` for that date with only those types. Dates with nothing missing are
skipped as before. One dashboard run therefore backfills the new types for
old days automatically.

- `RunDashboardResult.syncedDates` keeps its meaning: dates where at least
  one type was fetched this run.
- Known accepted behavior (unchanged from v1, now per-type): a (date, type)
  pair that genuinely has no data uploads no raw file and is re-fetched on
  each run.

## Testing

- `toCanonical` cases for the four new types (documented shape + fallback).
- Renderer: "—" tile for a metric with no data; true-0 renders as 0;
  "No data in this range" chart placeholder; `types` filtering.
- Orchestrator: a date with some types present gets `runSync` called with
  only the missing types.
- Markdown sections for the new types.

## Out of scope (deliberate)

Distance, floors, exercise sessions, VO2 max and other activity types (not
selected); intraday curves; per-metric display toggles beyond the existing
`dataTypes` config. The Health API point shapes for the new types are
pre-launch — parsing is verified against mocks like the existing five.
