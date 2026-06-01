# HealthSync

CLI that syncs Pixel Watch health data from the [Google Health API](https://developers.google.com/health) into a Google Drive folder, as both raw JSON archives and Obsidian-friendly Markdown daily notes.

## Prerequisites

- Node.js 22 LTS (`nvm use` reads `.nvmrc`)
- pnpm 9+ (`corepack enable` is the easiest way to install it)
- A Pixel Watch linked to your Google account
- A Google Cloud project with OAuth 2.0 credentials (see below)

## Google Cloud project setup (one-time)

1. Visit <https://console.cloud.google.com/> and create a new project.
2. Enable APIs (APIs & Services -> Library):
   - Google Health API
   - Google Drive API
3. Configure the OAuth consent screen:
   - User Type: **External**
   - Add yourself as a Test User
   - Add the readonly Health scopes needed by the default data types:
     - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
     - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
     - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - Add `https://www.googleapis.com/auth/drive.file`
4. Credentials -> Create OAuth client ID -> Application type: **Desktop app**.
5. Download the client JSON. Copy `.env.example` to `.env`, then paste the two values:

```bash
cp .env.example .env
```

```bash
HEALTHSYNC_CLIENT_ID=<client_id>
HEALTHSYNC_CLIENT_SECRET=<client_secret>
```

The CLI automatically loads `.env` from the repository root. Shell environment variables still win if both are set.

On Windows (PowerShell), create the same `.env` file manually or with:

```powershell
Copy-Item .env.example .env
```

> **Launch timing.** Google officially recommends waiting until **late May 2026** to **publicly launch** integrations against the Google Health API (to align with the Fitbit account deprecation). Development and personal use are fine today - that's what this MVP targets.

## Install + build

```bash
pnpm install
pnpm build
```

This builds both workspace packages (`@healthsync/core` and `@healthsync/cli`) into `packages/*/dist`.

## Usage

All commands are invoked via the compiled CLI entry point:

```bash
# First-time authorisation (opens browser, captures localhost callback)
node packages/cli/dist/index.js auth login

# First-time authorisation on a remote/headless server
node packages/cli/dist/index.js auth login --manual

# Check auth state
node packages/cli/dist/index.js auth status

# Revoke local tokens
node packages/cli/dist/index.js auth logout

# Sync yesterday's data (incremental default)
node packages/cli/dist/index.js sync

# Full backfill from a date
node packages/cli/dist/index.js sync --full --since 2026-01-01

# Only specific data types
node packages/cli/dist/index.js sync --types steps,sleep

# Overwrite existing files in Drive
node packages/cli/dist/index.js sync --force

# Machine-readable output for scripts
node packages/cli/dist/index.js sync --json

# List days already synced (reads .state/sync-state.json in Drive)
node packages/cli/dist/index.js list
node packages/cli/dist/index.js list --json

# Show effective configuration (merged defaults + config file)
node packages/cli/dist/index.js config show
node packages/cli/dist/index.js config show --json
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
node packages/cli/dist/index.js auth login --no-open --port 53682
```

The CLI prints a Google authorisation URL. Open it in your local browser and sign in. Google redirects to `http://127.0.0.1:53682/callback?...` on your laptop, and SSH forwards that request to the remote CLI.

Manual copy/paste login is still available as a fallback:

```bash
node packages/cli/dist/index.js auth login --manual
```

It prints a Google authorisation URL, then asks you to paste the full redirect URL after consent.

### Tokens on disk

After `auth login`, OAuth tokens are stored at:

- Linux / macOS: `~/.config/healthsync/tokens.json` (mode `0600`)
- Windows: `%APPDATA%\healthsync\tokens.json`

Make sure the parent directory is user-private - see the Windows caveat under Known limitations.

## Drive layout produced

```
HealthSync/
├── raw/YYYY/MM/YYYY-MM-DD_<type>.json
├── daily/YYYY/MM/YYYY-MM-DD.md
└── .state/sync-state.json
```

- `raw/` - immutable per-type JSON archives (one file per type per day).
- `daily/` - rendered Markdown daily note with wikilinks back to raw files and (optionally) your Obsidian journal.
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
  "dataTypes": ["steps", "heart-rate", "sleep", "active-zone-minutes", "spo2"],
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
