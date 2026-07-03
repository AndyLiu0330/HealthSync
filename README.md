# HealthSync

CLI that syncs Pixel Watch health data from the [Google Health API](https://developers.google.com/health) into a Google Drive folder, as both raw JSON archives and Obsidian-friendly Markdown daily notes.

## Prerequisites

- Node.js 22 LTS (`nvm use` reads `.nvmrc`)
- pnpm 9+ (`corepack enable` is the easiest way to install it)
- A Pixel Watch linked to your Google account
- Your own Google Cloud project with OAuth 2.0 credentials (see below)

## Bring your own Google Cloud project

HealthSync does not ship with shared Google Cloud credentials. For local development or self-hosting, create your own Google Cloud project and configure OAuth credentials for your Google account.

The Google Cloud project ID is user-specific but not treated as a secret. OAuth client secrets, downloaded credential JSON files, `.env` files, and local OAuth tokens are secrets and must not be committed.

## Google Cloud project setup (one-time)

1. Visit <https://console.cloud.google.com/> and create a new project.
2. Enable APIs (APIs & Services -> Library):
   - Google Health API
   - Google Drive API
3. Configure the OAuth consent screen:
   - User Type: **External**
   - Add yourself as a Test User
   - Add your app name and contact email
   - Add the readonly Health scopes needed by the default data types:
     - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
     - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
     - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - Add `https://www.googleapis.com/auth/drive.file`
4. Credentials -> Create OAuth client ID -> Application type: **Desktop app**.
5. Download the OAuth client JSON, then copy only the `client_id` and `client_secret` values into your local `.env` file:

```bash
cp .env.example .env
```

```bash
HEALTHSYNC_CLIENT_ID=your-client-id.apps.googleusercontent.com
HEALTHSYNC_CLIENT_SECRET=your-client-secret
```

The CLI automatically loads `.env` from the repository root. Shell environment variables still win if both are set.

On Windows (PowerShell), create the same `.env` file manually or with:

```powershell
Copy-Item .env.example .env
```

Do not commit the downloaded OAuth JSON file. The repository `.gitignore` excludes common local credential filenames, but you should still treat any downloaded Google credential file as private.

> **Launch timing.** Google officially recommends waiting until **late May 2026** to **publicly launch** integrations against the Google Health API (to align with the Fitbit account deprecation). Development and personal use are fine today - that's what this MVP targets.

## Install + build

```bash
pnpm install
pnpm build
cd packages/cli
pnpm link --global
```

This builds both workspace packages (`@healthsync/core` and `@healthsync/cli`) into `packages/*/dist`.
The global link makes the `healthsync` command available in your shell.
If `healthsync --help` is not found after linking, run `pnpm setup`, restart your shell, and repeat the link step.

## Usage

All commands are invoked with the `healthsync` command:

```bash
# First-time authorisation (opens browser, captures localhost callback)
healthsync connect

# First-time authorisation on a remote/headless server
healthsync connect --manual

# Check auth state
healthsync auth status

# Revoke local tokens
healthsync auth logout

# Sync yesterday's data (incremental default)
healthsync sync

# Full backfill from a date
healthsync sync --full --since 2026-01-01

# Only specific data types
healthsync sync --types steps,sleep

# Overwrite existing files in Drive
healthsync sync --force

# Machine-readable output for scripts
healthsync sync --json

# List days already synced (reads .state/sync-state.json in Drive)
healthsync list
healthsync list --json

# Sync the last week (or day/month) and open a static HTML dashboard
healthsync dashboard --range week

# Show effective configuration (merged defaults + config file)
healthsync config show
healthsync config show --json
```

Supported data types: `steps`, `heart-rate`, `sleep`, `active-zone-minutes`, `spo2`.
The `spo2` shortcut reads Google Health's `daily-oxygen-saturation` data type.

### Remote server authorisation

When the CLI runs on a remote server and your browser runs on your laptop, use an SSH tunnel so Google's loopback redirect reaches the remote CLI listener.

From your laptop, connect to the server with port forwarding:

```bash
ssh -L 53682:127.0.0.1:53682 user@remote-server
```

In that SSH session on the remote server, run:

```bash
healthsync connect --no-open --port 53682
```

The CLI prints a Google authorisation URL. Open it in your local browser and sign in. Google redirects to `http://127.0.0.1:53682/callback?...` on your laptop, and SSH forwards that request to the remote CLI.

Manual copy/paste login is still available as a fallback:

```bash
healthsync connect --manual
```

It prints a Google authorisation URL, then asks you to paste the full redirect URL after consent.

### Tokens on disk

After `connect`, OAuth tokens are stored at:

- Linux / macOS: `~/.config/healthsync/tokens.json` (mode `0600`)
- Windows: `%APPDATA%\healthsync\tokens.json`

Make sure the parent directory is user-private - see the Windows caveat under Known limitations.

## Drive layout produced

```
HealthSync/
├── raw/YYYY/MM/YYYY-MM-DD_<type>.json
├── daily/YYYY/MM/YYYY-MM-DD.md
├── dashboard.html
└── .state/sync-state.json
```

- `raw/` - immutable per-type JSON archives (one file per type per day).
- `daily/` - rendered Markdown daily note with wikilinks back to raw files and (optionally) your Obsidian journal.
- `dashboard.html` - self-contained HTML dashboard (summary tiles + trend charts) regenerated by `healthsync dashboard`; also saved locally next to your config (e.g. `~/.config/healthsync/dashboard.html`). Every enabled metric always renders a tile and chart, even with no data in range (tile shows "—", chart shows "No data in this range").
- `.state/sync-state.json` - last-successful-sync bookkeeping; the CLI uses this for incremental runs.

Point your Obsidian vault at `daily/` (or a synced local copy, e.g. via Google Drive for desktop) to browse daily notes with working wikilinks.

## Configuration

HealthSync ships with sensible defaults. Override any of them with a JSON file at:

- Linux / macOS: `~/.config/healthsync/config.json`
- Windows: `%APPDATA%\healthsync\config.json`

Example:

```json
{
  "driveRootFolder": "HealthSync",
  "dataTypes": ["steps", "calories", "heart-rate", "resting-heart-rate", "heart-rate-variability", "respiratory-rate", "sleep", "active-zone-minutes", "spo2"],
  "logLevel": "info"
}
```

Run `config show` to see the effective merged configuration.

## Development

```bash
pnpm typecheck   # tsc --noEmit across the workspace
pnpm test        # vitest across the workspace
pnpm lint        # biome check
pnpm format      # biome format --write
```

End-to-end coverage lives in `packages/core/test/e2e/` and runs under `pnpm test`.

## Known limitations / roadmap

This is an MVP. The following are known gaps that users should be aware of:

- **`--full` is currently a no-op.** The flag is accepted (and the CLI warns to stderr) but the sync orchestrator does not yet re-fetch past successful days; behaviour matches the default incremental sync. Tracked for a follow-up.
- **`--dry-run` is currently a no-op.** Same situation: the flag is accepted and warned, but the sync still uploads. Don't rely on it to preview a run yet.
- **Windows token file ACLs.** The `tokens.json` file is written with mode `0600` on Unix, but that bit is ignored on Windows - the file inherits NTFS ACLs from its parent directory. Ensure `%APPDATA%\healthsync` is user-private (it is by default, but worth checking if you've customised `%APPDATA%`).
- **Google Health API is still pre-launch.** The code targets the official v4 `users/me/dataTypes/{type}/dataPoints` list endpoint and current readonly Google Health scopes, verified against official docs and mocks. Google notes that breaking changes may still occur before the end of May 2026, so a first real run may still expose small API-shape changes.
- **Public launch timing.** See the note in *Google Cloud project setup* above - Google recommends waiting until late May 2026 before publishing an integration.

## Architecture

See `docs/superpowers/specs/2026-04-19-healthsync-design.md` for the full design, and `docs/superpowers/plans/2026-04-19-healthsync-cli-mvp.md` for the implementation plan that produced this MVP.
