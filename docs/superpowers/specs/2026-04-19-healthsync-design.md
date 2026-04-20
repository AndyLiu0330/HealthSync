# HealthSync Design Spec

- **Date**: 2026-04-19
- **Status**: Draft (pending user review)
- **Author**: andy (with Claude)

## 1. Summary

HealthSync is a Node.js/TypeScript tool that pulls health data from a user's Pixel Watch (via **Google Health API** — the successor to Fitbit Web API) and archives it into a structured Google Drive folder. The first release ships as a CLI; a future Web App will reuse the same core library.

## 2. Background & Context

### 2.1 Data source choice
The user originally referenced a generic "Google Health API". After investigation, three candidate APIs were considered:

| API | Verdict |
|-----|---------|
| Google Fit API | ❌ Being shut down on 2026-06-30 |
| Google Health API (`developers.google.com/health`) | ✅ Selected — OAuth 2.0 REST API, successor to Fitbit Web API, supports Pixel Watch |
| Android Health Connect | ❌ Android SDK only, not usable from a Node.js CLI |

### 2.2 Timing caveat
Google officially recommends waiting until **late May 2026** to publicly launch integrations with the Google Health API (to align with legacy Fitbit account deprecation). Development and testing can begin immediately; production rollout to additional users should wait.

### 2.3 User context
- Single user (the project owner).
- Owns a Pixel Watch.
- Wants data to serve multiple downstream uses over time: long-term backup, self-analysis, sharing with doctors/family, and feeding future AI/ML workflows.
- Primary reading surface: **Obsidian vault** via Markdown daily notes.

## 3. Goals

1. Authenticate the user's Google account via OAuth 2.0 (installed-application loopback flow).
2. Fetch a core set of health data types from the Google Health API on demand.
3. Upload raw JSON archives to Google Drive, organised by date and type.
4. Generate an **Obsidian-friendly Markdown daily note** per day, combining all types into a single readable file with YAML front matter, tags, and wikilinks.
5. Support both incremental (default) and full (`--full`) sync modes.
6. Provide a `--json` output mode on every CLI command so a future Web App can orchestrate it programmatically (though the Web App will ultimately call the `core` library directly).

## 4. Non-Goals (MVP)

- ❌ Processed/derived layer (CSV, Parquet) — the raw JSON layer enables these to be built later without re-fetching.
- ❌ PDF or Google Docs reports for sharing with doctors — format still undefined; defer until needed.
- ❌ Weekly/monthly roll-up Markdown files — Obsidian Dataview queries can produce these on demand; YAGNI for v1.
- ❌ Web App — separate milestone, gated on CLI stability.
- ❌ Multi-user support — current design handles a single Google account.
- ❌ Automatic scheduling (cron, GitHub Actions) — CLI is manual-invocation only for v1. User can wrap it in their own cron later.
- ❌ Data types beyond the five listed in §6.4 — easy to add via config after v1.

## 5. Constraints & Assumptions

- The Google Health API is assumed free for personal use at this scale, matching Fitbit Web API conventions (OAuth quotas, no per-call metered pricing). Pricing will be verified during OAuth client registration; if paid, the project will revisit cost assumptions before launch.
- Node.js 22 LTS is available on the user's machine.
- User has a Google Cloud project with OAuth 2.0 client credentials (setup documented in README, one-time).
- Pixel Watch data flows into the Google Health API via the user's linked account.
- Google Drive API v3 is available and has sufficient quota for daily sync traffic.

## 6. Architecture

### 6.1 Repository layout

Monorepo with **pnpm workspaces**:

```
healthsync/
├── packages/
│   ├── core/                ← core library (fetch · transform · store)
│   ├── cli/                 ← thin shell over core, using commander.js
│   └── web/                 ← [FUTURE] Hono/Fastify API + UI
├── docs/superpowers/specs/  ← this spec lives here
├── package.json
├── pnpm-workspace.yaml
├── biome.json               ← Biome for lint + format
└── tsconfig.base.json
```

### 6.2 Core library modules (`packages/core/src/`)

| Module | Responsibility |
|--------|----------------|
| `auth/` | OAuth 2.0 loopback flow, token persistence and refresh |
| `google-health/` | Typed wrapper around Google Health API (pagination, retries, rate limiting) |
| `google-drive/` | Typed wrapper around Google Drive API v3 (folder creation, upload, lookup) |
| `sync/` | Orchestration: fetch → transform → upload for each data type |
| `transform/json/` | Normalises raw API payloads into internal canonical shape |
| `transform/markdown/` | Renders canonical shape into per-type Markdown sections and assembles daily notes |
| `state/` | Reads/writes `sync-state.json` (last-sync timestamp per data type) |
| `config/` | Loads user config (enabled data types, Drive root folder name) |
| `errors/` | Typed error classes (AuthError, RateLimitError, NetworkError, etc.) |
| `logger/` | Structured logger; CLI formats human-readable, `--json` formats NDJSON |

### 6.3 CLI commands (`packages/cli/`)

All commands support `--json` for machine-readable output.

```
healthsync auth login              # first-time OAuth authorisation (opens browser)
healthsync auth status             # check whether a valid token exists
healthsync auth logout             # delete stored tokens

healthsync sync                    # incremental sync since last run
healthsync sync --full             # re-fetch all history
healthsync sync --since 2026-01-01 # fetch from a specific date
healthsync sync --types steps,sleep # limit to specific data types
healthsync sync --dry-run          # fetch + transform but skip upload
healthsync sync --force            # overwrite existing files in Drive (default: skip)

healthsync list                    # list files already synced to Drive
healthsync config show             # print current config
```

### 6.4 Data types supported in MVP

Five core types, commonly produced by Pixel Watch:

1. `steps` — daily step count
2. `heart-rate` — resting, average, max, zones
3. `sleep` — duration, stages (Deep/REM/Light), score
4. `active-zone-minutes` — Fat Burn / Cardio / Peak breakdown
5. `spo2` — overnight average blood-oxygen saturation

Adding a new type requires only: (a) a `google-health` fetch adapter, (b) a `transform/markdown` renderer, (c) an entry in `config`. No change to `sync`, `auth`, `state`, or `google-drive`.

## 7. Google Drive Layout

```
HealthSync/                          ← root folder (name configurable)
├── raw/                             ← full JSON backup, authoritative source
│   └── 2026/
│       └── 04/
│           ├── 2026-04-19_steps.json
│           ├── 2026-04-19_heart-rate.json
│           ├── 2026-04-19_sleep.json
│           ├── 2026-04-19_active-zone-minutes.json
│           └── 2026-04-19_spo2.json
├── daily/                           ← Obsidian-friendly Markdown daily notes
│   └── 2026/
│       └── 04/
│           └── 2026-04-19.md
└── .state/
    └── sync-state.json              ← {"steps": "2026-04-19T00:00:00Z", ...}
```

**Why per-day × per-type JSON files?** Incremental sync only needs to upload new files; corruption is isolated to a single file; future consumers (Web App, ML pipelines) can lazy-load just what they need.

## 8. Markdown Daily Note Format

Each `daily/YYYY/MM/YYYY-MM-DD.md` contains a YAML front-matter block followed by per-type sections:

```markdown
---
date: 2026-04-19
source: healthsync
tags: [health, daily, pixel-watch]
types: [steps, heart-rate, sleep, active-zone-minutes, spo2]
---

# 2026-04-19 Health Summary

## 🚶 Steps
- **Total**: 8,432 / 10,000 (84%)
- **Distance**: 6.1 km
- **Active minutes**: 47

## ❤️ Heart Rate
- **Resting**: 62 bpm
- **Average**: 78 bpm
- **Max**: 142 bpm (exercise)

## 😴 Sleep
- **Duration**: 7h 23m
- **Stages**: Deep 1h 12m · REM 1h 45m · Light 4h 26m
- **Score**: 84 / 100

## 🎯 Active Zone Minutes
- **Total**: 32 min (Fat Burn 22 · Cardio 10)

## 🫁 SpO2
- **Average overnight**: 96.8%

---

## 🔗 Links
- Raw JSON: [[../../raw/2026/04/2026-04-19_steps.json|steps]] · [[../../raw/2026/04/2026-04-19_heart-rate.json|heart-rate]] · [[../../raw/2026/04/2026-04-19_sleep.json|sleep]] · [[../../raw/2026/04/2026-04-19_active-zone-minutes.json|active-zone-minutes]] · [[../../raw/2026/04/2026-04-19_spo2.json|spo2]]
- Previous: [[2026-04-18]] · Next: [[2026-04-20]]
```

**Design decisions**:
- **YAML front matter** enables Obsidian Dataview queries (e.g., "last 30 days average sleep score"). This is why weekly/monthly roll-up Markdown files are not needed in v1.
- **Wikilinks** to previous/next day create an Obsidian-native navigation chain even without a daily-notes plugin.
- **Emoji headings** read well in Obsidian's graph and preview views.
- **Links back to raw JSON** let the user drill down from summary to source without leaving Obsidian.

If a data type has no data for a given day (e.g., user didn't wear the watch), that section is omitted (not shown as "N/A"), and the type is removed from the front-matter `types:` list.

## 9. Authentication

- **Flow**: OAuth 2.0 Installed Application flow with loopback redirect (`http://127.0.0.1:<random-port>/callback`). On first `healthsync auth login`, the CLI starts a temporary local server, opens the user's default browser, and captures the authorisation code on callback.
- **Scopes (requested on consent)**:
  - Google Health API: minimum scopes needed to read the five data types in §6.4 (exact scope strings finalised during implementation against the official docs).
  - Google Drive API: `https://www.googleapis.com/auth/drive.file` — least-privilege, only grants access to files the app itself creates.
- **Token storage**:
  - Path: `~/.config/healthsync/tokens.json` (Linux/macOS), `%APPDATA%\healthsync\tokens.json` (Windows).
  - File permissions: `0600`.
  - Contents: `{ access_token, refresh_token, expires_at, scope }`.
- **Refresh**: Automatic. If the access token is expired, `auth/` refreshes before returning it to callers. If refresh fails (revoked/expired), commands fail with a clear "please run `healthsync auth login` again" message.
- **Future Web App compatibility**: The Web App will use server-side authorisation-code flow, but the token record schema is identical, so the `auth/` storage layer can be reused.

## 10. Error handling & resilience

- **Retries**: Exponential backoff with jitter on transient HTTP errors (`5xx`, network failures, `429 Too Many Requests`). Max 5 attempts per request.
- **Rate limiting**: Respect `Retry-After` header when present.
- **Partial failure**: If one data type fails, other types continue. The final CLI exit code is non-zero if any type failed, and the JSON output lists per-type status.
- **State integrity**: `sync-state.json` is only updated for data types that successfully uploaded, so a failed type will be retried on next run.
- **Idempotency**: Uploading a file that already exists in Drive is a no-op unless `--force` is passed.

## 11. Tech stack

| Concern | Choice |
|---------|--------|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 5.x (strict mode) |
| Package manager | pnpm (workspaces) |
| CLI framework | commander.js |
| Google APIs | official `googleapis` npm package |
| HTTP retries | built on `googleapis` retry config + custom wrapper |
| Config format | JSON (at `~/.config/healthsync/config.json`) |
| Test runner | Vitest |
| HTTP test fixtures | nock (recorded API responses) |
| Lint + format | Biome |
| CI | GitHub Actions (typecheck · lint · test on push) |

## 12. Success criteria

The MVP is "done" when:

1. `healthsync auth login` completes successfully end-to-end on a fresh machine.
2. `healthsync sync` fetches all five data types for the current day and uploads them to Drive in both `raw/` and `daily/` layouts.
3. `healthsync sync --full --since 2026-01-01` backfills history without duplicates.
4. The generated Markdown daily notes open in Obsidian with correct front matter, readable structure, and working wikilinks.
5. `sync-state.json` correctly tracks per-type last-sync timestamps across runs.
6. A failed data type does not corrupt state for other types.
7. All CLI commands support `--json` with a documented output schema.
8. Tests cover: auth flow happy path, token refresh, one representative data-type fetch + transform, incremental vs full sync, error recovery.

## 13. Open questions for implementation phase

- Exact Google Health API scope strings (confirm against `developers.google.com/health` docs during implementation).
- Whether the Markdown renderer should link to relative paths (`../../raw/...`) or use absolute Drive URLs — depends on how the user mounts Drive into Obsidian. Default: relative paths for portability.
- Whether to checksum `sync-state.json` or use Drive's revision history as the source of truth.

## 14. Future work (post-MVP, tracked separately)

- `packages/web` — Hono/Fastify Web App, reuses `packages/core` directly.
- `processed/` layer — CSV/Parquet derivations for analysis.
- `reports/` layer — monthly PDF/Docs reports for sharing.
- Additional data types (workouts, stress, menstrual cycle, temperature variation, etc.).
- Multi-user support.
- Optional scheduler (cron wrapper or GitHub Actions template).
