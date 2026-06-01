# HealthSync CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript Node.js CLI that pulls Pixel Watch health data via Google Health API and archives it into Google Drive as raw JSON plus Obsidian-friendly Markdown daily notes.

**Architecture:** pnpm monorepo with two packages — `@healthsync/core` (reusable library: auth, API clients, transforms, orchestration) and `@healthsync/cli` (thin `commander.js` shell that imports `core`). A future Web App will import `core` directly, not shell out to the CLI.

**Tech Stack:** Node.js 22 LTS, TypeScript 5 (strict), pnpm workspaces, `commander.js`, `googleapis`, `open`, Vitest, `nock`, Biome.

---

## File Structure

```
healthsync/
├── .gitignore
├── .nvmrc
├── biome.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── README.md                                                 (Task 19)
├── docs/superpowers/
│   ├── specs/2026-04-19-healthsync-design.md                (already exists)
│   └── plans/2026-04-19-healthsync-cli-mvp.md               (this file)
└── packages/
    ├── core/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vitest.config.ts
    │   ├── src/
    │   │   ├── index.ts                                      (public barrel)
    │   │   ├── errors/index.ts                               (Task 4)
    │   │   ├── logger/index.ts                               (Task 5)
    │   │   ├── config/schema.ts                              (Task 6)
    │   │   ├── config/index.ts                               (Task 6)
    │   │   ├── state/index.ts                                (Task 7)
    │   │   ├── auth/token-store.ts                           (Task 8)
    │   │   ├── auth/loopback.ts                              (Task 8)
    │   │   ├── auth/index.ts                                 (Task 8)
    │   │   ├── google-drive/index.ts                         (Task 9)
    │   │   ├── google-health/types.ts                        (Task 10)
    │   │   ├── google-health/index.ts                        (Task 10)
    │   │   ├── transform/json/index.ts                       (Task 11)
    │   │   ├── transform/markdown/sections/steps.ts          (Task 12)
    │   │   ├── transform/markdown/sections/heart-rate.ts     (Task 12)
    │   │   ├── transform/markdown/sections/sleep.ts          (Task 12)
    │   │   ├── transform/markdown/sections/active-zone-minutes.ts (Task 12)
    │   │   ├── transform/markdown/sections/spo2.ts           (Task 12)
    │   │   ├── transform/markdown/index.ts                   (Task 12)
    │   │   └── sync/index.ts                                 (Task 13)
    │   └── tests/                                            (Vitest co-located with unit; integration here)
    └── cli/
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts                                      (Task 17)
        │   ├── commands/auth.ts                              (Task 14)
        │   ├── commands/sync.ts                              (Task 15)
        │   ├── commands/list.ts                              (Task 16)
        │   └── commands/config.ts                            (Task 16)
        └── tests/                                            (Task 17 E2E lives here)
```

**Dependency order:** errors → logger → (config, state) → auth → google-drive + google-health → transforms → sync → CLI commands → E2E.

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `/home/andy/project/HealthSync/.gitignore`
- Create: `/home/andy/project/HealthSync/.nvmrc`
- Create: `/home/andy/project/HealthSync/package.json`
- Create: `/home/andy/project/HealthSync/pnpm-workspace.yaml`
- Create: `/home/andy/project/HealthSync/tsconfig.base.json`
- Create: `/home/andy/project/HealthSync/biome.json`

- [ ] **Step 1: Write `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
*.log
.DS_Store
# Local runtime state
.healthsync-local/
# Editor
.vscode/
.idea/
```

- [ ] **Step 2: Write `.nvmrc`**

```
22
```

- [ ] **Step 3: Write root `package.json`**

```json
{
  "name": "healthsync",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 5: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 6: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": { "ignore": ["dist/**", "node_modules/**", "coverage/**"] }
}
```

- [ ] **Step 7: Install root deps**

Run: `pnpm install`
Expected: creates `pnpm-lock.yaml`, installs Biome + TypeScript at root.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .nvmrc package.json pnpm-workspace.yaml tsconfig.base.json biome.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo with TS + Biome"
```

---

## Task 2: `@healthsync/core` package scaffold + Vitest

**Files:**
- Create: `/home/andy/project/HealthSync/packages/core/package.json`
- Create: `/home/andy/project/HealthSync/packages/core/tsconfig.json`
- Create: `/home/andy/project/HealthSync/packages/core/vitest.config.ts`
- Create: `/home/andy/project/HealthSync/packages/core/src/index.ts`
- Create: `/home/andy/project/HealthSync/packages/core/src/health.test.ts`

- [ ] **Step 1: Write `packages/core/package.json`**

```json
{
  "name": "@healthsync/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "googleapis": "^144.0.0",
    "open": "^10.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "nock": "^13.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "dist", "node_modules"]
}
```

- [ ] **Step 3: Write `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
  },
});
```

- [ ] **Step 4: Write the failing sanity test `src/health.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { version } from "./index.js";

describe("core package health check", () => {
  it("exposes a version string", () => {
    expect(version).toBe("0.0.0");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @healthsync/core test`
Expected: FAIL — `version` is not exported.

- [ ] **Step 6: Write minimal `src/index.ts`**

```ts
export const version = "0.0.0";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @healthsync/core test`
Expected: 1 test passed.

- [ ] **Step 8: Install core deps + commit**

```bash
pnpm install
git add packages/core pnpm-lock.yaml
git commit -m "chore(core): scaffold @healthsync/core package with Vitest"
```

---

## Task 3: `@healthsync/cli` package scaffold

**Files:**
- Create: `/home/andy/project/HealthSync/packages/cli/package.json`
- Create: `/home/andy/project/HealthSync/packages/cli/tsconfig.json`
- Create: `/home/andy/project/HealthSync/packages/cli/src/index.ts`

- [ ] **Step 1: Write `packages/cli/package.json`**

```json
{
  "name": "@healthsync/cli",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "bin": { "healthsync": "./dist/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@healthsync/core": "workspace:*",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `packages/cli/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [{ "path": "../core" }],
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "dist", "node_modules"]
}
```

- [ ] **Step 3: Write placeholder `src/index.ts` (real wiring in Task 17)**

```ts
#!/usr/bin/env node
import { version } from "@healthsync/core";

console.log(`healthsync ${version}`);
```

- [ ] **Step 4: Verify build + install**

Run:
```bash
pnpm install
pnpm --filter @healthsync/core build
pnpm --filter @healthsync/cli build
healthsync
```
Expected: prints `healthsync 0.0.0`.

- [ ] **Step 5: Commit**

```bash
git add packages/cli pnpm-lock.yaml
git commit -m "chore(cli): scaffold @healthsync/cli with commander dep"
```

---

## Task 4: `core/errors` — typed error classes

**Files:**
- Create: `packages/core/src/errors/index.ts`
- Create: `packages/core/src/errors/index.test.ts`

- [ ] **Step 1: Write failing test `errors/index.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import {
  AuthError,
  ConfigError,
  HealthSyncError,
  NetworkError,
  RateLimitError,
  StateError,
} from "./index.js";

describe("HealthSync error classes", () => {
  it("all errors inherit from HealthSyncError and keep their name", () => {
    const cases = [
      new AuthError("bad token"),
      new ConfigError("missing field"),
      new NetworkError("timeout"),
      new RateLimitError("slow down", 30),
      new StateError("corrupt state"),
    ];
    for (const err of cases) {
      expect(err).toBeInstanceOf(HealthSyncError);
      expect(err.name).toBe(err.constructor.name);
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("RateLimitError carries retryAfterSeconds", () => {
    const err = new RateLimitError("slow down", 42);
    expect(err.retryAfterSeconds).toBe(42);
  });

  it("errors preserve cause when provided", () => {
    const cause = new Error("underlying");
    const err = new NetworkError("wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});
```

- [ ] **Step 2: Run test (expected to fail — module not found)**

Run: `pnpm --filter @healthsync/core test src/errors`
Expected: FAIL.

- [ ] **Step 3: Implement `errors/index.ts`**

```ts
export class HealthSyncError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class AuthError extends HealthSyncError {}
export class ConfigError extends HealthSyncError {}
export class StateError extends HealthSyncError {}
export class NetworkError extends HealthSyncError {}

export class RateLimitError extends HealthSyncError {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number, options?: { cause?: unknown }) {
    super(message, options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter @healthsync/core test src/errors`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors
git commit -m "feat(core): add typed HealthSyncError hierarchy"
```

---

## Task 5: `core/logger` — structured + human logger

**Files:**
- Create: `packages/core/src/logger/index.ts`
- Create: `packages/core/src/logger/index.test.ts`

- [ ] **Step 1: Write failing test `logger/index.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./index.js";

describe("createLogger", () => {
  it("human mode prints level + message to stderr", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger({ mode: "human", level: "info" });
    logger.info("hello", { foo: 1 });
    expect(err).toHaveBeenCalled();
    const line = String(err.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("INFO");
    expect(line).toContain("hello");
    err.mockRestore();
  });

  it("json mode prints NDJSON to stdout", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createLogger({ mode: "json", level: "debug" });
    logger.warn("oops", { code: 7 });
    const line = String(out.mock.calls[0]?.[0] ?? "");
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("oops");
    expect(parsed.code).toBe(7);
    expect(typeof parsed.time).toBe("string");
    out.mockRestore();
  });

  it("filters messages below configured level", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger({ mode: "human", level: "warn" });
    logger.debug("ignored");
    logger.info("ignored");
    logger.warn("shown");
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/logger`
Expected: FAIL.

- [ ] **Step 3: Implement `logger/index.ts`**

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMode = "human" | "json";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  mode: LogMode;
  level: LogLevel;
}

export function createLogger(opts: LoggerOptions): Logger {
  const threshold = LEVEL_ORDER[opts.level];

  function write(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < threshold) return;
    if (opts.mode === "json") {
      const record = { time: new Date().toISOString(), level, msg, ...(fields ?? {}) };
      process.stdout.write(`${JSON.stringify(record)}\n`);
    } else {
      const extra = fields ? ` ${JSON.stringify(fields)}` : "";
      process.stderr.write(`${level.toUpperCase()} ${msg}${extra}\n`);
    }
  }

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter @healthsync/core test src/logger`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/logger
git commit -m "feat(core): add human/JSON structured logger"
```

---

## Task 6: `core/config` — load and validate JSON config

**Files:**
- Create: `packages/core/src/config/schema.ts`
- Create: `packages/core/src/config/index.ts`
- Create: `packages/core/src/config/index.test.ts`

- [ ] **Step 1: Write failing test `config/index.test.ts`**

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../errors/index.js";
import { DEFAULT_CONFIG, loadConfig } from "./index.js";

async function tmpDir() {
  return mkdtemp(join(tmpdir(), "healthsync-cfg-"));
}

describe("loadConfig", () => {
  it("returns DEFAULT_CONFIG when file missing", async () => {
    const dir = await tmpDir();
    const cfg = await loadConfig(join(dir, "config.json"));
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it("merges user config over defaults", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ driveRootFolder: "MyHealth" }));
    const cfg = await loadConfig(path);
    expect(cfg.driveRootFolder).toBe("MyHealth");
    expect(cfg.dataTypes).toEqual(DEFAULT_CONFIG.dataTypes);
  });

  it("throws ConfigError on invalid JSON", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, "{not json");
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigError);
  });

  it("throws ConfigError on unknown dataTypes entry", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ dataTypes: ["steps", "bogus"] }));
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigError);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/config`

- [ ] **Step 3: Implement `config/schema.ts`**

```ts
export const SUPPORTED_DATA_TYPES = [
  "steps",
  "heart-rate",
  "sleep",
  "active-zone-minutes",
  "spo2",
] as const;

export type DataType = (typeof SUPPORTED_DATA_TYPES)[number];

export interface HealthSyncConfig {
  driveRootFolder: string;
  dataTypes: DataType[];
  logLevel: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_CONFIG: HealthSyncConfig = {
  driveRootFolder: "HealthSync",
  dataTypes: [...SUPPORTED_DATA_TYPES],
  logLevel: "info",
};
```

- [ ] **Step 4: Implement `config/index.ts`**

```ts
import { readFile } from "node:fs/promises";
import { ConfigError } from "../errors/index.js";
import {
  DEFAULT_CONFIG,
  type DataType,
  type HealthSyncConfig,
  SUPPORTED_DATA_TYPES,
} from "./schema.js";

export { DEFAULT_CONFIG, SUPPORTED_DATA_TYPES };
export type { DataType, HealthSyncConfig };

export async function loadConfig(path: string): Promise<HealthSyncConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw new ConfigError(`failed to read config at ${path}`, { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`invalid JSON in config ${path}`, { cause: err });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ConfigError(`config must be a JSON object: ${path}`);
  }

  const merged: HealthSyncConfig = { ...DEFAULT_CONFIG, ...(parsed as Partial<HealthSyncConfig>) };

  for (const t of merged.dataTypes) {
    if (!SUPPORTED_DATA_TYPES.includes(t as DataType)) {
      throw new ConfigError(`unknown data type in config: ${t}`);
    }
  }
  return merged;
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/config`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config
git commit -m "feat(core): add config loader with defaults and validation"
```

---

## Task 7: `core/state` — sync-state persistence

**Files:**
- Create: `packages/core/src/state/index.ts`
- Create: `packages/core/src/state/index.test.ts`

- [ ] **Step 1: Write failing test `state/index.test.ts`**

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSyncState, saveSyncState, updateLastSync } from "./index.js";

async function tmpFile() {
  const dir = await mkdtemp(join(tmpdir(), "healthsync-state-"));
  return join(dir, "sync-state.json");
}

describe("sync state", () => {
  it("load returns empty state when file missing", async () => {
    const path = await tmpFile();
    const state = await loadSyncState(path);
    expect(state).toEqual({ lastSync: {} });
  });

  it("save then load round-trips", async () => {
    const path = await tmpFile();
    await saveSyncState(path, { lastSync: { steps: "2026-04-19T00:00:00.000Z" } });
    const state = await loadSyncState(path);
    expect(state.lastSync.steps).toBe("2026-04-19T00:00:00.000Z");
  });

  it("updateLastSync merges a type without touching others", async () => {
    const path = await tmpFile();
    await saveSyncState(path, {
      lastSync: { steps: "2026-04-18T00:00:00.000Z", sleep: "2026-04-17T00:00:00.000Z" },
    });
    await updateLastSync(path, "steps", "2026-04-19T00:00:00.000Z");
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.lastSync.steps).toBe("2026-04-19T00:00:00.000Z");
    expect(after.lastSync.sleep).toBe("2026-04-17T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/state`

- [ ] **Step 3: Implement `state/index.ts`**

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DataType } from "../config/index.js";
import { StateError } from "../errors/index.js";

export interface SyncState {
  lastSync: Partial<Record<DataType, string>>; // ISO 8601 UTC
}

const EMPTY: SyncState = { lastSync: {} };

export async function loadSyncState(path: string): Promise<SyncState> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as SyncState;
    if (typeof parsed !== "object" || parsed === null || typeof parsed.lastSync !== "object") {
      throw new StateError(`corrupt sync state at ${path}`);
    }
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { lastSync: {} };
    if (err instanceof StateError) throw err;
    throw new StateError(`failed to load sync state at ${path}`, { cause: err });
  }
}

export async function saveSyncState(path: string, state: SyncState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export async function updateLastSync(
  path: string,
  type: DataType,
  isoTimestamp: string,
): Promise<void> {
  const current = await loadSyncState(path);
  const next: SyncState = {
    ...current,
    lastSync: { ...current.lastSync, [type]: isoTimestamp },
  };
  await saveSyncState(path, next);
}

export { EMPTY as EMPTY_SYNC_STATE };
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/state`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/state
git commit -m "feat(core): persist per-type last-sync timestamps"
```

---

## Task 8: `core/auth` — OAuth 2.0 loopback flow + token store

**Files:**
- Create: `packages/core/src/auth/token-store.ts`
- Create: `packages/core/src/auth/token-store.test.ts`
- Create: `packages/core/src/auth/loopback.ts`
- Create: `packages/core/src/auth/loopback.test.ts`
- Create: `packages/core/src/auth/index.ts`

- [ ] **Step 1: Failing test `auth/token-store.test.ts`**

```ts
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadTokens, saveTokens, type StoredTokens } from "./token-store.js";

async function tmpPath() {
  const dir = await mkdtemp(join(tmpdir(), "healthsync-tok-"));
  return join(dir, "tokens.json");
}

const sample: StoredTokens = {
  access_token: "AT",
  refresh_token: "RT",
  expires_at: "2026-04-19T12:00:00.000Z",
  scope: "https://www.googleapis.com/auth/drive.file",
};

describe("token store", () => {
  it("returns null when file missing", async () => {
    expect(await loadTokens(await tmpPath())).toBeNull();
  });

  it("saves with 0600 permissions and round-trips", async () => {
    const path = await tmpPath();
    await saveTokens(path, sample);
    const info = await stat(path);
    expect(info.mode & 0o777).toBe(0o600);
    const loaded = await loadTokens(path);
    expect(loaded).toEqual(sample);
  });

  it("overwrites atomically when saved twice", async () => {
    const path = await tmpPath();
    await saveTokens(path, sample);
    await saveTokens(path, { ...sample, access_token: "AT2" });
    const content = JSON.parse(await readFile(path, "utf8"));
    expect(content.access_token).toBe("AT2");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/auth/token-store`

- [ ] **Step 3: Implement `auth/token-store.ts`**

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AuthError } from "../errors/index.js";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
}

export async function loadTokens(path: string): Promise<StoredTokens | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as StoredTokens;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AuthError(`failed to read tokens at ${path}`, { cause: err });
  }
}

export async function saveTokens(path: string, tokens: StoredTokens): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/auth/token-store`
Expected: 3 passed.

- [ ] **Step 5: Failing test `auth/loopback.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { captureAuthCode } from "./loopback.js";

describe("captureAuthCode", () => {
  it("resolves with the code when the browser hits /callback?code=...", async () => {
    const capture = captureAuthCode({ state: "xyz" });
    const { port, promise } = await capture.ready;

    // simulate the browser callback
    const res = await fetch(`http://127.0.0.1:${port}/callback?code=ABC&state=xyz`);
    expect(res.status).toBe(200);

    const code = await promise;
    expect(code).toBe("ABC");
  });

  it("rejects when state mismatches", async () => {
    const capture = captureAuthCode({ state: "xyz" });
    const { port, promise } = await capture.ready;
    await fetch(`http://127.0.0.1:${port}/callback?code=ABC&state=WRONG`);
    await expect(promise).rejects.toThrow(/state mismatch/i);
  });
});
```

- [ ] **Step 6: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/auth/loopback`

- [ ] **Step 7: Implement `auth/loopback.ts`**

```ts
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { AuthError } from "../errors/index.js";

export interface LoopbackCapture {
  ready: Promise<{ port: number; promise: Promise<string> }>;
  cancel(): void;
}

export function captureAuthCode(opts: { state: string }): LoopbackCapture {
  let resolve!: (code: string) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) return;
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (state !== opts.state) {
      res.statusCode = 400;
      res.end("state mismatch");
      reject(new AuthError("OAuth state mismatch — possible CSRF"));
      server.close();
      return;
    }
    if (!code) {
      res.statusCode = 400;
      res.end("missing code");
      reject(new AuthError("OAuth callback missing code"));
      server.close();
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<html><body><h1>Authorised</h1>You may close this tab.</body></html>");
    resolve(code);
    server.close();
  });

  const ready = new Promise<{ port: number; promise: Promise<string> }>((readyResolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      readyResolve({ port, promise });
    });
  });

  return {
    ready,
    cancel() {
      reject(new AuthError("loopback capture cancelled"));
      server.close();
    },
  };
}
```

- [ ] **Step 8: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/auth/loopback`
Expected: 2 passed.

- [ ] **Step 9: Implement `auth/index.ts` (OAuth client + refresh)**

```ts
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import openBrowser from "open";
import { AuthError } from "../errors/index.js";
import { captureAuthCode } from "./loopback.js";
import { loadTokens, saveTokens, type StoredTokens } from "./token-store.js";

export const GOOGLE_HEALTH_SCOPES = [
  "https://www.googleapis.com/auth/health.read",
];
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
export const ALL_SCOPES = [...GOOGLE_HEALTH_SCOPES, ...DRIVE_SCOPES];

export interface AuthOptions {
  clientId: string;
  clientSecret: string;
  tokensPath: string;
  scopes?: string[];
  openBrowser?: (url: string) => Promise<unknown>;
}

export async function login(opts: AuthOptions): Promise<StoredTokens> {
  const state = randomBytes(16).toString("hex");
  const capture = captureAuthCode({ state });
  const { port, promise } = await capture.ready;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret, redirectUri);
  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: opts.scopes ?? ALL_SCOPES,
    state,
  });

  const open = opts.openBrowser ?? (async (url) => openBrowser(url));
  await open(authUrl);

  const code = await promise;
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new AuthError("incomplete token response from Google");
  }
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(tokens.expiry_date).toISOString(),
    scope: String(tokens.scope ?? (opts.scopes ?? ALL_SCOPES).join(" ")),
  };
  await saveTokens(opts.tokensPath, stored);
  return stored;
}

export async function getAuthenticatedClient(opts: Omit<AuthOptions, "openBrowser">) {
  const tokens = await loadTokens(opts.tokensPath);
  if (!tokens) throw new AuthError("no stored tokens — run `healthsync connect` first");

  const oauth2 = new google.auth.OAuth2(opts.clientId, opts.clientSecret);
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.parse(tokens.expires_at),
    scope: tokens.scope,
  });

  oauth2.on("tokens", async (newTokens) => {
    if (!newTokens.access_token || !newTokens.expiry_date) return;
    await saveTokens(opts.tokensPath, {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
      expires_at: new Date(newTokens.expiry_date).toISOString(),
      scope: String(newTokens.scope ?? tokens.scope),
    });
  });

  return oauth2;
}

export async function authStatus(opts: { tokensPath: string }): Promise<
  { authenticated: false } | { authenticated: true; expiresAt: string; scope: string }
> {
  const tokens = await loadTokens(opts.tokensPath);
  if (!tokens) return { authenticated: false };
  return { authenticated: true, expiresAt: tokens.expires_at, scope: tokens.scope };
}

export async function logout(opts: { tokensPath: string }): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(opts.tokensPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
```

> Note: Exact Google Health scope strings are a spec §13 open question. If `health.read` is wrong, update `GOOGLE_HEALTH_SCOPES` per `developers.google.com/health/api/scopes` (use context7 MCP to fetch the current reference). Tests are insensitive to the exact scope string.

- [ ] **Step 10: Typecheck + test all auth**

Run: `pnpm --filter @healthsync/core typecheck && pnpm --filter @healthsync/core test src/auth`
Expected: typecheck clean, tests pass.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/auth
git commit -m "feat(core): OAuth 2.0 loopback flow with token store"
```

---

## Task 9: `core/google-drive` — folder + upload wrapper

**Files:**
- Create: `packages/core/src/google-drive/index.ts`
- Create: `packages/core/src/google-drive/index.test.ts`

- [ ] **Step 1: Failing test `google-drive/index.test.ts` (nock-based)**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { google } from "googleapis";
import { DriveClient } from "./index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("DriveClient", () => {
  beforeEach(() => nock.cleanAll());

  it("ensureFolderPath creates missing folders and returns the leaf id", async () => {
    const api = nock("https://www.googleapis.com");

    // Root lookup: "HealthSync" — not found.
    api
      .get("/drive/v3/files")
      .query((q) => q.q?.includes("'root' in parents") && q.q?.includes("HealthSync"))
      .reply(200, { files: [] });
    // Create "HealthSync" under root.
    api.post("/drive/v3/files").reply(200, { id: "root-id", name: "HealthSync" });
    // "raw" lookup under "root-id" — not found.
    api
      .get("/drive/v3/files")
      .query((q) => q.q?.includes("'root-id' in parents") && q.q?.includes("raw"))
      .reply(200, { files: [] });
    api.post("/drive/v3/files").reply(200, { id: "raw-id", name: "raw" });

    const client = new DriveClient(fakeAuth());
    const id = await client.ensureFolderPath(["HealthSync", "raw"]);
    expect(id).toBe("raw-id");
  });

  it("uploadJSON writes multipart body and returns the file id", async () => {
    const api = nock("https://www.googleapis.com");
    api
      .post("/upload/drive/v3/files")
      .query((q) => q.uploadType === "multipart")
      .reply(200, { id: "file-1", name: "sample.json" });

    const client = new DriveClient(fakeAuth());
    const id = await client.uploadJSON({
      parentId: "raw-id",
      name: "sample.json",
      body: { foo: 1 },
    });
    expect(id).toBe("file-1");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/google-drive`

- [ ] **Step 3: Implement `google-drive/index.ts`**

```ts
import type { OAuth2Client } from "google-auth-library";
import { google, type drive_v3 } from "googleapis";
import { NetworkError } from "../errors/index.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export interface UploadJSONParams {
  parentId: string;
  name: string;
  body: unknown;
  overwriteFileId?: string;
}

export interface UploadMarkdownParams {
  parentId: string;
  name: string;
  body: string;
  overwriteFileId?: string;
}

export class DriveClient {
  private readonly drive: drive_v3.Drive;

  constructor(auth: OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
  }

  async findChild(parentId: string, name: string): Promise<string | null> {
    const q = `'${parentId}' in parents and name = '${escape(name)}' and trashed = false`;
    const res = await this.drive.files.list({ q, fields: "files(id,name)", pageSize: 1 });
    return res.data.files?.[0]?.id ?? null;
  }

  async createFolder(parentId: string, name: string): Promise<string> {
    const res = await this.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive createFolder: no id for ${name}`);
    return res.data.id;
  }

  async ensureFolderPath(segments: string[]): Promise<string> {
    let parent = "root";
    for (const name of segments) {
      const existing = await this.findChild(parent, name);
      parent = existing ?? (await this.createFolder(parent, name));
    }
    return parent;
  }

  async uploadJSON(p: UploadJSONParams): Promise<string> {
    const media = { mimeType: "application/json", body: JSON.stringify(p.body, null, 2) };
    if (p.overwriteFileId) {
      const res = await this.drive.files.update({
        fileId: p.overwriteFileId,
        media,
        fields: "id",
      });
      return res.data.id ?? p.overwriteFileId;
    }
    const res = await this.drive.files.create({
      requestBody: { name: p.name, parents: [p.parentId] },
      media,
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
    return res.data.id;
  }

  async uploadMarkdown(p: UploadMarkdownParams): Promise<string> {
    const media = { mimeType: "text/markdown", body: p.body };
    if (p.overwriteFileId) {
      const res = await this.drive.files.update({
        fileId: p.overwriteFileId,
        media,
        fields: "id",
      });
      return res.data.id ?? p.overwriteFileId;
    }
    const res = await this.drive.files.create({
      requestBody: { name: p.name, parents: [p.parentId] },
      media,
      fields: "id",
    });
    if (!res.data.id) throw new NetworkError(`Drive upload: no id for ${p.name}`);
    return res.data.id;
  }

  async listChildren(parentId: string): Promise<Array<{ id: string; name: string }>> {
    const all: Array<{ id: string; name: string }> = [];
    let pageToken: string | undefined;
    do {
      const res = await this.drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id,name)",
        pageSize: 1000,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (f.id && f.name) all.push({ id: f.id, name: f.name });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return all;
  }
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/google-drive`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/google-drive
git commit -m "feat(core): Drive client with ensureFolderPath and upload helpers"
```

---

## Task 10: `core/google-health` — Health API fetch wrapper

**Files:**
- Create: `packages/core/src/google-health/types.ts`
- Create: `packages/core/src/google-health/index.ts`
- Create: `packages/core/src/google-health/index.test.ts`

> **Before writing code in this task:** use the `mcp__plugin_context7_context7__resolve-library-id` + `query-docs` tools to fetch the current Google Health API endpoint shape for each of the five data types in `src/config/schema.ts`. The wrapper below assumes a REST endpoint per type at `https://health.googleapis.com/v1/users/me/{type}/read?startTime&endTime`; adjust if the live spec differs. Tests mock HTTP so they are insensitive to the exact path — update the `nock` path to match the real endpoint once confirmed.

- [ ] **Step 1: Implement `google-health/types.ts`**

```ts
import type { DataType } from "../config/index.js";

export interface RawDataPoint {
  // Raw payload as returned by Google Health API — kept verbatim for archive.
  [k: string]: unknown;
}

export interface DataTypeResult {
  type: DataType;
  startTime: string; // ISO 8601 UTC
  endTime: string;
  points: RawDataPoint[];
}
```

- [ ] **Step 2: Failing test `google-health/index.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import { google } from "googleapis";
import { HealthClient } from "./index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("HealthClient.fetch", () => {
  beforeEach(() => nock.cleanAll());

  it("returns points for a given range", async () => {
    const api = nock("https://health.googleapis.com");
    api
      .get("/v1/users/me/steps/read")
      .query(true)
      .reply(200, { points: [{ date: "2026-04-19", value: 8432 }] });

    const client = new HealthClient(fakeAuth());
    const result = await client.fetch({
      type: "steps",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
    });
    expect(result.type).toBe("steps");
    expect(result.points).toHaveLength(1);
    expect(result.points[0]).toEqual({ date: "2026-04-19", value: 8432 });
  });

  it("retries on 429 with Retry-After honored then succeeds", async () => {
    const api = nock("https://health.googleapis.com");
    api.get("/v1/users/me/sleep/read").query(true).reply(429, {}, { "Retry-After": "0" });
    api.get("/v1/users/me/sleep/read").query(true).reply(200, { points: [] });

    const client = new HealthClient(fakeAuth(), { maxRetries: 3, baseDelayMs: 1 });
    const result = await client.fetch({
      type: "sleep",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
    });
    expect(result.points).toEqual([]);
  });

  it("throws NetworkError after exhausting retries", async () => {
    const api = nock("https://health.googleapis.com");
    api.get("/v1/users/me/spo2/read").query(true).times(4).reply(500, {});

    const client = new HealthClient(fakeAuth(), { maxRetries: 3, baseDelayMs: 1 });
    await expect(
      client.fetch({
        type: "spo2",
        startTime: "2026-04-19T00:00:00.000Z",
        endTime: "2026-04-20T00:00:00.000Z",
      }),
    ).rejects.toThrow(/Health API/i);
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/google-health`

- [ ] **Step 4: Implement `google-health/index.ts`**

```ts
import type { OAuth2Client } from "google-auth-library";
import type { DataType } from "../config/index.js";
import { NetworkError, RateLimitError } from "../errors/index.js";
import type { DataTypeResult, RawDataPoint } from "./types.js";

export interface HealthClientOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  baseUrl?: string;
}

export interface FetchParams {
  type: DataType;
  startTime: string; // ISO 8601
  endTime: string;
}

const DEFAULT_BASE = "https://health.googleapis.com/v1";

export class HealthClient {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly auth: OAuth2Client,
    opts: HealthClientOptions = {},
  ) {
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  }

  async fetch(p: FetchParams): Promise<DataTypeResult> {
    const url = new URL(`${this.baseUrl}/users/me/${p.type}/read`);
    url.searchParams.set("startTime", p.startTime);
    url.searchParams.set("endTime", p.endTime);
    const data = await this.request<{ points?: RawDataPoint[] }>(url);
    return {
      type: p.type,
      startTime: p.startTime,
      endTime: p.endTime,
      points: data.points ?? [],
    };
  }

  private async request<T>(url: URL): Promise<T> {
    const { token } = await this.auth.getAccessToken();
    if (!token) throw new NetworkError("no access token available");

    let attempt = 0;
    while (true) {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (res.ok) return (await res.json()) as T;

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? 1);
        if (attempt >= this.maxRetries) {
          throw new RateLimitError(`Health API rate-limited: ${url.pathname}`, retryAfter);
        }
        await sleep(retryAfter * 1000);
        attempt += 1;
        continue;
      }

      if (res.status >= 500 && attempt < this.maxRetries) {
        await sleep(backoffDelay(this.baseDelayMs, attempt));
        attempt += 1;
        continue;
      }

      const text = await res.text().catch(() => "");
      throw new NetworkError(
        `Health API error ${res.status} on ${url.pathname}: ${text.slice(0, 200)}`,
      );
    }
  }
}

function backoffDelay(base: number, attempt: number): number {
  const exp = base * 2 ** attempt;
  const jitter = Math.random() * base;
  return exp + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/google-health`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/google-health
git commit -m "feat(core): Health API client with retry + rate-limit handling"
```

---

## Task 11: `core/transform/json` — canonical shape

**Files:**
- Create: `packages/core/src/transform/json/index.ts`
- Create: `packages/core/src/transform/json/index.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { toCanonical, type CanonicalDay } from "./index.js";

describe("toCanonical", () => {
  it("pulls the date-level summary for steps", () => {
    const canonical = toCanonical({
      type: "steps",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ date: "2026-04-19", value: 8432, goal: 10000, distanceMeters: 6100 }],
    });
    expect(canonical.date).toBe("2026-04-19");
    expect(canonical.steps).toEqual({ total: 8432, goal: 10000, distanceMeters: 6100 });
  });

  it("returns CanonicalDay with date only when no points", () => {
    const canonical: CanonicalDay = toCanonical({
      type: "sleep",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [],
    });
    expect(canonical).toEqual({ date: "2026-04-19" });
  });

  it("captures heart-rate resting/avg/max", () => {
    const c = toCanonical({
      type: "heart-rate",
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ date: "2026-04-19", resting: 62, average: 78, max: 142 }],
    });
    expect(c.heartRate).toEqual({ resting: 62, average: 78, max: 142 });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/transform/json`

- [ ] **Step 3: Implement**

```ts
import type { DataTypeResult } from "../../google-health/types.js";

export interface CanonicalDay {
  date: string; // YYYY-MM-DD UTC
  steps?: { total: number; goal?: number; distanceMeters?: number; activeMinutes?: number };
  heartRate?: { resting?: number; average?: number; max?: number };
  sleep?: {
    durationMinutes?: number;
    score?: number;
    stages?: { deep?: number; rem?: number; light?: number; awake?: number };
  };
  activeZoneMinutes?: { total?: number; fatBurn?: number; cardio?: number; peak?: number };
  spo2?: { averageOvernight?: number };
}

export function toCanonical(result: DataTypeResult): CanonicalDay {
  const date = result.startTime.slice(0, 10);
  const point = result.points[0] as Record<string, unknown> | undefined;
  if (!point) return { date };

  switch (result.type) {
    case "steps":
      return {
        date,
        steps: {
          total: num(point.value),
          goal: opt(point.goal),
          distanceMeters: opt(point.distanceMeters),
          activeMinutes: opt(point.activeMinutes),
        },
      };
    case "heart-rate":
      return {
        date,
        heartRate: {
          resting: opt(point.resting),
          average: opt(point.average),
          max: opt(point.max),
        },
      };
    case "sleep":
      return {
        date,
        sleep: {
          durationMinutes: opt(point.durationMinutes),
          score: opt(point.score),
          stages: {
            deep: opt((point.stages as Record<string, unknown>)?.deep),
            rem: opt((point.stages as Record<string, unknown>)?.rem),
            light: opt((point.stages as Record<string, unknown>)?.light),
            awake: opt((point.stages as Record<string, unknown>)?.awake),
          },
        },
      };
    case "active-zone-minutes":
      return {
        date,
        activeZoneMinutes: {
          total: opt(point.total),
          fatBurn: opt(point.fatBurn),
          cardio: opt(point.cardio),
          peak: opt(point.peak),
        },
      };
    case "spo2":
      return { date, spo2: { averageOvernight: opt(point.averageOvernight) } };
  }
}

export function mergeCanonical(days: CanonicalDay[]): CanonicalDay {
  if (days.length === 0) throw new Error("mergeCanonical: empty input");
  const base: CanonicalDay = { date: days[0]!.date };
  for (const d of days) {
    Object.assign(base, { ...d, date: base.date });
  }
  return base;
}

function num(v: unknown): number {
  if (typeof v !== "number") throw new Error(`expected number, got ${typeof v}`);
  return v;
}
function opt(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/transform/json`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/transform/json
git commit -m "feat(core): normalize health points into canonical day shape"
```

---

## Task 12: `core/transform/markdown` — daily note renderer

**Files:**
- Create: `packages/core/src/transform/markdown/sections/steps.ts`
- Create: `packages/core/src/transform/markdown/sections/heart-rate.ts`
- Create: `packages/core/src/transform/markdown/sections/sleep.ts`
- Create: `packages/core/src/transform/markdown/sections/active-zone-minutes.ts`
- Create: `packages/core/src/transform/markdown/sections/spo2.ts`
- Create: `packages/core/src/transform/markdown/index.ts`
- Create: `packages/core/src/transform/markdown/index.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderDailyNote } from "./index.js";

describe("renderDailyNote", () => {
  it("renders front matter + sections for populated day", () => {
    const md = renderDailyNote({
      date: "2026-04-19",
      steps: { total: 8432, goal: 10000, distanceMeters: 6100, activeMinutes: 47 },
      heartRate: { resting: 62, average: 78, max: 142 },
      sleep: {
        durationMinutes: 443,
        score: 84,
        stages: { deep: 72, rem: 105, light: 266, awake: 0 },
      },
      activeZoneMinutes: { total: 32, fatBurn: 22, cardio: 10, peak: 0 },
      spo2: { averageOvernight: 96.8 },
    });

    expect(md).toMatch(/^---\n/);
    expect(md).toContain("date: 2026-04-19");
    expect(md).toContain("types: [steps, heart-rate, sleep, active-zone-minutes, spo2]");
    expect(md).toContain("# 2026-04-19 Health Summary");
    expect(md).toContain("🚶 Steps");
    expect(md).toContain("**Total**: 8,432 / 10,000 (84%)");
    expect(md).toContain("❤️ Heart Rate");
    expect(md).toContain("**Resting**: 62 bpm");
    expect(md).toContain("😴 Sleep");
    expect(md).toContain("**Duration**: 7h 23m");
    expect(md).toContain("🎯 Active Zone Minutes");
    expect(md).toContain("🫁 SpO2");
    expect(md).toContain("[[2026-04-18]]");
    expect(md).toContain("[[2026-04-20]]");
  });

  it("omits sections with no data and excludes them from front-matter types", () => {
    const md = renderDailyNote({
      date: "2026-04-19",
      steps: { total: 8432 },
    });
    expect(md).toContain("types: [steps]");
    expect(md).toContain("🚶 Steps");
    expect(md).not.toContain("😴 Sleep");
    expect(md).not.toContain("🫁 SpO2");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/transform/markdown`

- [ ] **Step 3: Implement `sections/steps.ts`**

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderStepsSection(day: CanonicalDay): string | null {
  const s = day.steps;
  if (!s) return null;
  const lines = ["## 🚶 Steps"];
  if (typeof s.goal === "number" && s.goal > 0) {
    const pct = Math.round((s.total / s.goal) * 100);
    lines.push(`- **Total**: ${fmt(s.total)} / ${fmt(s.goal)} (${pct}%)`);
  } else {
    lines.push(`- **Total**: ${fmt(s.total)}`);
  }
  if (typeof s.distanceMeters === "number") {
    lines.push(`- **Distance**: ${(s.distanceMeters / 1000).toFixed(1)} km`);
  }
  if (typeof s.activeMinutes === "number") {
    lines.push(`- **Active minutes**: ${s.activeMinutes}`);
  }
  return lines.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
```

- [ ] **Step 4: Implement `sections/heart-rate.ts`**

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderHeartRateSection(day: CanonicalDay): string | null {
  const hr = day.heartRate;
  if (!hr) return null;
  const lines = ["## ❤️ Heart Rate"];
  if (typeof hr.resting === "number") lines.push(`- **Resting**: ${hr.resting} bpm`);
  if (typeof hr.average === "number") lines.push(`- **Average**: ${hr.average} bpm`);
  if (typeof hr.max === "number") lines.push(`- **Max**: ${hr.max} bpm`);
  return lines.join("\n");
}
```

- [ ] **Step 5: Implement `sections/sleep.ts`**

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderSleepSection(day: CanonicalDay): string | null {
  const sl = day.sleep;
  if (!sl) return null;
  const lines = ["## 😴 Sleep"];
  if (typeof sl.durationMinutes === "number") {
    lines.push(`- **Duration**: ${durationLabel(sl.durationMinutes)}`);
  }
  const stages = sl.stages;
  if (stages) {
    const parts: string[] = [];
    if (typeof stages.deep === "number") parts.push(`Deep ${durationLabel(stages.deep)}`);
    if (typeof stages.rem === "number") parts.push(`REM ${durationLabel(stages.rem)}`);
    if (typeof stages.light === "number") parts.push(`Light ${durationLabel(stages.light)}`);
    if (typeof stages.awake === "number" && stages.awake > 0)
      parts.push(`Awake ${durationLabel(stages.awake)}`);
    if (parts.length) lines.push(`- **Stages**: ${parts.join(" · ")}`);
  }
  if (typeof sl.score === "number") lines.push(`- **Score**: ${sl.score} / 100`);
  return lines.join("\n");
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
```

- [ ] **Step 6: Implement `sections/active-zone-minutes.ts`**

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderActiveZoneMinutesSection(day: CanonicalDay): string | null {
  const a = day.activeZoneMinutes;
  if (!a) return null;
  const lines = ["## 🎯 Active Zone Minutes"];
  const total = typeof a.total === "number" ? a.total : 0;
  const parts: string[] = [];
  if (typeof a.fatBurn === "number") parts.push(`Fat Burn ${a.fatBurn}`);
  if (typeof a.cardio === "number") parts.push(`Cardio ${a.cardio}`);
  if (typeof a.peak === "number" && a.peak > 0) parts.push(`Peak ${a.peak}`);
  const suffix = parts.length ? ` (${parts.join(" · ")})` : "";
  lines.push(`- **Total**: ${total} min${suffix}`);
  return lines.join("\n");
}
```

- [ ] **Step 7: Implement `sections/spo2.ts`**

```ts
import type { CanonicalDay } from "../../json/index.js";

export function renderSpo2Section(day: CanonicalDay): string | null {
  const s = day.spo2;
  if (!s || typeof s.averageOvernight !== "number") return null;
  return ["## 🫁 SpO2", `- **Average overnight**: ${s.averageOvernight.toFixed(1)}%`].join("\n");
}
```

- [ ] **Step 8: Implement `transform/markdown/index.ts`**

```ts
import type { CanonicalDay } from "../json/index.js";
import { renderActiveZoneMinutesSection } from "./sections/active-zone-minutes.js";
import { renderHeartRateSection } from "./sections/heart-rate.js";
import { renderSleepSection } from "./sections/sleep.js";
import { renderSpo2Section } from "./sections/spo2.js";
import { renderStepsSection } from "./sections/steps.js";

const ORDER = [
  { key: "steps", render: renderStepsSection },
  { key: "heart-rate", render: renderHeartRateSection },
  { key: "sleep", render: renderSleepSection },
  { key: "active-zone-minutes", render: renderActiveZoneMinutesSection },
  { key: "spo2", render: renderSpo2Section },
] as const;

export function renderDailyNote(day: CanonicalDay): string {
  const sections: Array<{ key: string; body: string }> = [];
  for (const entry of ORDER) {
    const body = entry.render(day);
    if (body) sections.push({ key: entry.key, body });
  }

  const types = sections.map((s) => s.key).join(", ");
  const { prev, next } = adjacentDates(day.date);

  const lines: string[] = [];
  lines.push("---");
  lines.push(`date: ${day.date}`);
  lines.push("source: healthsync");
  lines.push("tags: [health, daily, pixel-watch]");
  lines.push(`types: [${types}]`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${day.date} Health Summary`);
  lines.push("");
  for (const s of sections) {
    lines.push(s.body);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("## 🔗 Links");
  const rawLinks = sections
    .map((s) => `[[../../raw/${pathParts(day.date)}_${s.key}.json|${s.key}]]`)
    .join(" · ");
  lines.push(`- Raw JSON: ${rawLinks}`);
  lines.push(`- Previous: [[${prev}]] · Next: [[${next}]]`);
  lines.push("");
  return lines.join("\n");
}

function adjacentDates(date: string): { prev: string; next: string } {
  const d = new Date(`${date}T00:00:00Z`);
  const p = new Date(d);
  p.setUTCDate(p.getUTCDate() - 1);
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + 1);
  return {
    prev: p.toISOString().slice(0, 10),
    next: n.toISOString().slice(0, 10),
  };
}

function pathParts(date: string): string {
  const [y, m, _d] = date.split("-");
  return `${y}/${m}/${date}`;
}
```

- [ ] **Step 9: Run — expect pass**

Run: `pnpm --filter @healthsync/core test src/transform/markdown`
Expected: 2 passed.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/transform/markdown
git commit -m "feat(core): render Obsidian-friendly Markdown daily notes"
```

---

## Task 13: `core/sync` — orchestration

**Files:**
- Create: `packages/core/src/sync/index.ts`
- Create: `packages/core/src/sync/index.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Failing test `sync/index.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { runSync } from "./index.js";

function makeHealthStub() {
  return {
    fetch: vi.fn(async ({ type }) => ({
      type,
      startTime: "2026-04-19T00:00:00.000Z",
      endTime: "2026-04-20T00:00:00.000Z",
      points: [{ date: "2026-04-19", value: 8432, goal: 10000 }],
    })),
  };
}

function makeDriveStub() {
  const calls: Array<{ method: string; args: unknown }> = [];
  return {
    calls,
    ensureFolderPath: vi.fn(async () => "folder-id"),
    uploadJSON: vi.fn(async (p) => {
      calls.push({ method: "uploadJSON", args: p });
      return `json-${p.name}`;
    }),
    uploadMarkdown: vi.fn(async (p) => {
      calls.push({ method: "uploadMarkdown", args: p });
      return `md-${p.name}`;
    }),
    listChildren: vi.fn(async () => []),
  };
}

describe("runSync", () => {
  it("fetches each configured type, uploads raw JSON + one daily MD", async () => {
    const state = { get: vi.fn(async () => ({ lastSync: {} })), setType: vi.fn(async () => {}) };
    const result = await runSync({
      health: makeHealthStub(),
      drive: makeDriveStub(),
      state,
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-04-20T00:00:00Z"),
    });
    expect(result.perType.steps.status).toBe("ok");
    expect(result.perType.steps.rawFileId).toMatch(/json-2026-04-19_steps\.json/);
    expect(result.dailyMarkdownFileId).toMatch(/md-2026-04-19\.md/);
    expect(state.setType).toHaveBeenCalledWith("steps", expect.any(String));
  });

  it("one failing type does not block others; state only advances on success", async () => {
    const health = {
      fetch: vi.fn(async ({ type }) => {
        if (type === "sleep") throw new Error("boom");
        return {
          type,
          startTime: "2026-04-19T00:00:00.000Z",
          endTime: "2026-04-20T00:00:00.000Z",
          points: [{ date: "2026-04-19", value: 1 }],
        };
      }),
    };
    const state = { get: vi.fn(async () => ({ lastSync: {} })), setType: vi.fn(async () => {}) };
    const result = await runSync({
      health,
      drive: makeDriveStub(),
      state,
      types: ["steps", "sleep"],
      driveRoot: "HealthSync",
      now: new Date("2026-04-20T00:00:00Z"),
    });
    expect(result.perType.steps.status).toBe("ok");
    expect(result.perType.sleep.status).toBe("error");
    expect(state.setType).toHaveBeenCalledWith("steps", expect.any(String));
    expect(state.setType).not.toHaveBeenCalledWith("sleep", expect.anything());
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/core test src/sync`

- [ ] **Step 3: Implement `sync/index.ts`**

```ts
import type { DataType } from "../config/index.js";
import { toCanonical, mergeCanonical, type CanonicalDay } from "../transform/json/index.js";
import { renderDailyNote } from "../transform/markdown/index.js";

export interface HealthPort {
  fetch(p: {
    type: DataType;
    startTime: string;
    endTime: string;
  }): Promise<{ type: DataType; startTime: string; endTime: string; points: unknown[] }>;
}

export interface DrivePort {
  ensureFolderPath(segments: string[]): Promise<string>;
  uploadJSON(p: {
    parentId: string;
    name: string;
    body: unknown;
    overwriteFileId?: string;
  }): Promise<string>;
  uploadMarkdown(p: {
    parentId: string;
    name: string;
    body: string;
    overwriteFileId?: string;
  }): Promise<string>;
  listChildren(parentId: string): Promise<Array<{ id: string; name: string }>>;
}

export interface StatePort {
  get(): Promise<{ lastSync: Partial<Record<DataType, string>> }>;
  setType(type: DataType, isoTimestamp: string): Promise<void>;
}

export interface RunSyncParams {
  health: HealthPort;
  drive: DrivePort;
  state: StatePort;
  types: DataType[];
  driveRoot: string;
  now: Date;
  force?: boolean;
  since?: string; // ISO 8601; if omitted, computes the last full UTC day
}

export interface PerTypeResult {
  type: DataType;
  status: "ok" | "error";
  rawFileId?: string;
  error?: string;
}

export interface RunSyncResult {
  date: string;
  perType: Record<string, PerTypeResult>;
  dailyMarkdownFileId?: string;
}

export async function runSync(p: RunSyncParams): Promise<RunSyncResult> {
  const end = p.now;
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  const startIso = (p.since ?? start.toISOString()).replace(/\.\d+Z$/, ".000Z");
  const endIso = endUtc.toISOString().replace(/\.\d+Z$/, ".000Z");
  const dateKey = startIso.slice(0, 10);
  const [year, month] = dateKey.split("-") as [string, string];

  const rawFolder = await p.drive.ensureFolderPath([p.driveRoot, "raw", year, month]);
  const dailyFolder = await p.drive.ensureFolderPath([p.driveRoot, "daily", year, month]);

  const perType: Record<string, PerTypeResult> = {};
  const successfulDays: CanonicalDay[] = [];

  for (const type of p.types) {
    try {
      const result = await p.health.fetch({ type, startTime: startIso, endTime: endIso });
      const canonical = toCanonical(result as never);
      if (!hasPayload(canonical, type)) {
        perType[type] = { type, status: "ok" };
        await p.state.setType(type, endIso);
        continue;
      }
      const rawFileId = await p.drive.uploadJSON({
        parentId: rawFolder,
        name: `${dateKey}_${type}.json`,
        body: result,
      });
      perType[type] = { type, status: "ok", rawFileId };
      successfulDays.push(canonical);
      await p.state.setType(type, endIso);
    } catch (err) {
      perType[type] = { type, status: "error", error: (err as Error).message };
    }
  }

  let dailyMarkdownFileId: string | undefined;
  if (successfulDays.length > 0) {
    const merged = mergeCanonical(successfulDays);
    const md = renderDailyNote(merged);
    dailyMarkdownFileId = await p.drive.uploadMarkdown({
      parentId: dailyFolder,
      name: `${dateKey}.md`,
      body: md,
    });
  }

  return { date: dateKey, perType, dailyMarkdownFileId };
}

function hasPayload(day: CanonicalDay, type: DataType): boolean {
  switch (type) {
    case "steps":
      return day.steps !== undefined;
    case "heart-rate":
      return day.heartRate !== undefined;
    case "sleep":
      return day.sleep !== undefined;
    case "active-zone-minutes":
      return day.activeZoneMinutes !== undefined;
    case "spo2":
      return day.spo2 !== undefined;
  }
}
```

- [ ] **Step 4: Update `src/index.ts` to re-export everything**

```ts
export const version = "0.0.0";
export * from "./errors/index.js";
export * from "./logger/index.js";
export * from "./config/index.js";
export * from "./state/index.js";
export * as auth from "./auth/index.js";
export { DriveClient } from "./google-drive/index.js";
export { HealthClient } from "./google-health/index.js";
export { toCanonical, mergeCanonical, type CanonicalDay } from "./transform/json/index.js";
export { renderDailyNote } from "./transform/markdown/index.js";
export {
  runSync,
  type HealthPort,
  type DrivePort,
  type StatePort,
  type RunSyncParams,
  type RunSyncResult,
  type PerTypeResult,
} from "./sync/index.js";
```

- [ ] **Step 5: Typecheck + tests all-green**

Run:
```bash
pnpm --filter @healthsync/core typecheck
pnpm --filter @healthsync/core test
```
Expected: typecheck clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src
git commit -m "feat(core): runSync orchestrates fetch → transform → upload"
```

---

## Task 14: `cli/commands/auth` — login, status, logout

**Files:**
- Create: `packages/cli/src/commands/auth.ts`
- Create: `packages/cli/src/commands/auth.test.ts`

- [ ] **Step 1: Failing test `auth.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildAuthCommand } from "./auth.js";

describe("auth command", () => {
  it("status prints { authenticated: false } when no tokens", async () => {
    const out: string[] = [];
    const cmd = buildAuthCommand({
      paths: { tokens: "/tmp/does-not-exist-xyz.json" },
      credentials: { clientId: "x", clientSecret: "y" },
      writeLine: (s) => out.push(s),
      openBrowser: vi.fn(),
    });
    await cmd.parseAsync(["node", "healthsync", "status", "--json"]);
    const last = JSON.parse(out[out.length - 1] ?? "{}");
    expect(last).toEqual({ authenticated: false });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/cli test src/commands/auth`

- [ ] **Step 3: Implement `commands/auth.ts`**

```ts
import { Command } from "commander";
import { auth } from "@healthsync/core";

export interface AuthCommandDeps {
  paths: { tokens: string };
  credentials: { clientId: string; clientSecret: string };
  writeLine: (s: string) => void;
  openBrowser: (url: string) => Promise<unknown>;
}

export function buildAuthCommand(deps: AuthCommandDeps): Command {
  const cmd = new Command("auth").description("OAuth authorisation");

  cmd
    .command("login")
    .description("Authorise with Google and store tokens")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const tokens = await auth.login({
        clientId: deps.credentials.clientId,
        clientSecret: deps.credentials.clientSecret,
        tokensPath: deps.paths.tokens,
        openBrowser: deps.openBrowser,
      });
      if (opts.json) {
        deps.writeLine(JSON.stringify({ authenticated: true, expiresAt: tokens.expires_at }));
      } else {
        deps.writeLine(`Authorised. Token expires at ${tokens.expires_at}.`);
      }
    });

  cmd
    .command("status")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const s = await auth.authStatus({ tokensPath: deps.paths.tokens });
      if (opts.json) deps.writeLine(JSON.stringify(s));
      else deps.writeLine(s.authenticated ? `Authenticated (expires ${s.expiresAt})` : "Not authenticated");
    });

  cmd
    .command("logout")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      await auth.logout({ tokensPath: deps.paths.tokens });
      if (opts.json) deps.writeLine(JSON.stringify({ ok: true }));
      else deps.writeLine("Logged out.");
    });

  return cmd;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @healthsync/cli test src/commands/auth`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/auth.ts packages/cli/src/commands/auth.test.ts
git commit -m "feat(cli): auth login/status/logout commands"
```

---

## Task 15: `cli/commands/sync` — sync command with flags

**Files:**
- Create: `packages/cli/src/commands/sync.ts`
- Create: `packages/cli/src/commands/sync.test.ts`

- [ ] **Step 1: Failing test `sync.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import type { RunSyncParams, RunSyncResult } from "@healthsync/core";
import { buildSyncCommand } from "./sync.js";

describe("sync command", () => {
  it("passes parsed flags to runSync and prints JSON output when --json", async () => {
    const runSync = vi.fn(async (_p: RunSyncParams): Promise<RunSyncResult> => ({
      date: "2026-04-19",
      perType: { steps: { type: "steps", status: "ok", rawFileId: "f1" } },
      dailyMarkdownFileId: "md1",
    }));
    const out: string[] = [];
    const cmd = buildSyncCommand({
      buildDeps: async () => ({
        health: { fetch: vi.fn() } as never,
        drive: {} as never,
        state: {} as never,
        driveRoot: "HealthSync",
        types: ["steps", "heart-rate", "sleep", "active-zone-minutes", "spo2"],
      }),
      runSync,
      writeLine: (s) => out.push(s),
      now: () => new Date("2026-04-20T00:00:00Z"),
    });
    await cmd.parseAsync([
      "node",
      "healthsync",
      "--types",
      "steps",
      "--since",
      "2026-04-19T00:00:00.000Z",
      "--force",
      "--json",
    ]);
    expect(runSync).toHaveBeenCalledTimes(1);
    const arg = runSync.mock.calls[0]?.[0];
    expect(arg?.types).toEqual(["steps"]);
    expect(arg?.since).toBe("2026-04-19T00:00:00.000Z");
    expect(arg?.force).toBe(true);
    const last = JSON.parse(out[out.length - 1] ?? "{}");
    expect(last.date).toBe("2026-04-19");
    expect(last.perType.steps.status).toBe("ok");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/cli test src/commands/sync`

- [ ] **Step 3: Implement `commands/sync.ts`**

```ts
import { Command } from "commander";
import {
  type DataType,
  type DrivePort,
  type HealthPort,
  type RunSyncParams,
  type RunSyncResult,
  type StatePort,
  SUPPORTED_DATA_TYPES,
} from "@healthsync/core";

export interface SyncDeps {
  buildDeps: () => Promise<{
    health: HealthPort;
    drive: DrivePort;
    state: StatePort;
    driveRoot: string;
    types: DataType[];
  }>;
  runSync: (p: RunSyncParams) => Promise<RunSyncResult>;
  writeLine: (s: string) => void;
  now: () => Date;
}

export function buildSyncCommand(deps: SyncDeps): Command {
  return new Command("sync")
    .description("Sync health data from Google Health API into Drive")
    .option("--full", "re-fetch all history (ignores state)")
    .option("--since <iso>", "start date, ISO 8601 UTC")
    .option("--types <list>", "comma-separated data types")
    .option("--dry-run", "fetch + transform but skip upload")
    .option("--force", "overwrite existing files in Drive")
    .option("--json", "machine-readable output")
    .action(
      async (opts: {
        full?: boolean;
        since?: string;
        types?: string;
        dryRun?: boolean;
        force?: boolean;
        json?: boolean;
      }) => {
        const base = await deps.buildDeps();
        const types = opts.types
          ? opts.types.split(",").map((t) => t.trim()).filter((t): t is DataType =>
              (SUPPORTED_DATA_TYPES as readonly string[]).includes(t),
            )
          : base.types;

        const params: RunSyncParams = {
          health: base.health,
          drive: base.drive,
          state: base.state,
          types,
          driveRoot: base.driveRoot,
          now: deps.now(),
          force: opts.force ?? false,
          ...(opts.since ? { since: opts.since } : {}),
        };
        const result = await deps.runSync(params);
        if (opts.json) {
          deps.writeLine(JSON.stringify(result));
        } else {
          deps.writeLine(`Date: ${result.date}`);
          for (const [type, r] of Object.entries(result.perType)) {
            deps.writeLine(`  ${type}: ${r.status}${r.error ? ` (${r.error})` : ""}`);
          }
          if (result.dailyMarkdownFileId) {
            deps.writeLine(`Daily note: ${result.dailyMarkdownFileId}`);
          }
        }
      },
    );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --filter @healthsync/cli test src/commands/sync`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/sync.ts packages/cli/src/commands/sync.test.ts
git commit -m "feat(cli): sync command with type/since/force/dry-run/json flags"
```

---

## Task 16: `cli/commands/list` and `cli/commands/config`

**Files:**
- Create: `packages/cli/src/commands/list.ts`
- Create: `packages/cli/src/commands/config.ts`
- Create: `packages/cli/src/commands/list.test.ts`

- [ ] **Step 1: Failing test `list.test.ts`**

```ts
import { describe, expect, it, vi } from "vitest";
import { buildListCommand } from "./list.js";

describe("list command", () => {
  it("prints each file under raw/ as JSON array", async () => {
    const drive = {
      ensureFolderPath: vi.fn(async () => "folder-id"),
      listChildren: vi.fn(async () => [
        { id: "a", name: "2026-04-19_steps.json" },
        { id: "b", name: "2026-04-19_sleep.json" },
      ]),
    };
    const out: string[] = [];
    const cmd = buildListCommand({
      buildDrive: async () => ({ drive: drive as never, driveRoot: "HealthSync" }),
      writeLine: (s) => out.push(s),
    });
    await cmd.parseAsync(["node", "healthsync", "--json"]);
    const parsed = JSON.parse(out[out.length - 1] ?? "[]");
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("2026-04-19_steps.json");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @healthsync/cli test src/commands/list`

- [ ] **Step 3: Implement `commands/list.ts`**

```ts
import { Command } from "commander";
import type { DrivePort } from "@healthsync/core";

export interface ListDeps {
  buildDrive: () => Promise<{ drive: DrivePort; driveRoot: string }>;
  writeLine: (s: string) => void;
}

export function buildListCommand(deps: ListDeps): Command {
  return new Command("list")
    .description("List synced files in Drive (raw/ layer)")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const { drive, driveRoot } = await deps.buildDrive();
      const folderId = await drive.ensureFolderPath([driveRoot, "raw"]);
      const children = await drive.listChildren(folderId);
      if (opts.json) {
        deps.writeLine(JSON.stringify(children));
      } else {
        for (const c of children) deps.writeLine(`${c.id}\t${c.name}`);
      }
    });
}
```

- [ ] **Step 4: Implement `commands/config.ts`**

```ts
import { Command } from "commander";
import type { HealthSyncConfig } from "@healthsync/core";

export interface ConfigDeps {
  loadConfig: () => Promise<HealthSyncConfig>;
  writeLine: (s: string) => void;
}

export function buildConfigCommand(deps: ConfigDeps): Command {
  const cmd = new Command("config").description("Inspect HealthSync configuration");
  cmd
    .command("show")
    .option("--json", "machine-readable output")
    .action(async (opts: { json?: boolean }) => {
      const cfg = await deps.loadConfig();
      if (opts.json) deps.writeLine(JSON.stringify(cfg, null, 2));
      else for (const [k, v] of Object.entries(cfg)) deps.writeLine(`${k}: ${JSON.stringify(v)}`);
    });
  return cmd;
}
```

- [ ] **Step 5: Run — expect pass**

Run: `pnpm --filter @healthsync/cli test src/commands/list`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/list.ts packages/cli/src/commands/config.ts packages/cli/src/commands/list.test.ts
git commit -m "feat(cli): list + config show commands"
```

---

## Task 17: CLI entry point wiring

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create: `packages/cli/src/paths.ts`

- [ ] **Step 1: Write `src/paths.ts`**

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export function configDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ? join(process.env.APPDATA, "healthsync") : join(homedir(), "AppData", "Roaming", "healthsync");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "healthsync") : join(homedir(), ".config", "healthsync");
}

export function tokensPath(): string {
  return join(configDir(), "tokens.json");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function statePath(): string {
  return join(configDir(), "sync-state.json");
}
```

- [ ] **Step 2: Replace `src/index.ts` with full wiring**

```ts
#!/usr/bin/env node
import { Command } from "commander";
import openBrowser from "open";
import {
  DriveClient,
  HealthClient,
  auth,
  loadConfig,
  loadSyncState,
  runSync,
  updateLastSync,
  version,
} from "@healthsync/core";
import { buildAuthCommand } from "./commands/auth.js";
import { buildConfigCommand } from "./commands/config.js";
import { buildListCommand } from "./commands/list.js";
import { buildSyncCommand } from "./commands/sync.js";
import { configPath, statePath, tokensPath } from "./paths.js";

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.HEALTHSYNC_CLIENT_ID;
  const clientSecret = process.env.HEALTHSYNC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "HEALTHSYNC_CLIENT_ID and HEALTHSYNC_CLIENT_SECRET must be set (see README).",
    );
    process.exit(2);
  }
  return { clientId, clientSecret };
}

async function buildSyncDeps() {
  const cfg = await loadConfig(configPath());
  const credentials = getCredentials();
  const client = await auth.getAuthenticatedClient({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    tokensPath: tokensPath(),
  });
  return {
    health: new HealthClient(client),
    drive: new DriveClient(client),
    state: {
      async get() { return loadSyncState(statePath()); },
      async setType(type, iso) { await updateLastSync(statePath(), type, iso); },
    },
    driveRoot: cfg.driveRootFolder,
    types: cfg.dataTypes,
  };
}

async function main() {
  const program = new Command("healthsync")
    .description("Sync Pixel Watch health data to Google Drive")
    .version(version);

  const credentials = getCredentials();

  program.addCommand(
    buildAuthCommand({
      paths: { tokens: tokensPath() },
      credentials,
      writeLine: (s) => console.log(s),
      openBrowser: async (url) => openBrowser(url),
    }),
  );

  program.addCommand(
    buildSyncCommand({
      buildDeps: buildSyncDeps,
      runSync,
      writeLine: (s) => console.log(s),
      now: () => new Date(),
    }),
  );

  program.addCommand(
    buildListCommand({
      buildDrive: async () => {
        const d = await buildSyncDeps();
        return { drive: d.drive, driveRoot: d.driveRoot };
      },
      writeLine: (s) => console.log(s),
    }),
  );

  program.addCommand(
    buildConfigCommand({
      loadConfig: () => loadConfig(configPath()),
      writeLine: (s) => console.log(s),
    }),
  );

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  process.exit(1);
});
```

- [ ] **Step 3: Build + smoke test**

Run:
```bash
pnpm --filter @healthsync/core build
pnpm --filter @healthsync/cli build
HEALTHSYNC_CLIENT_ID=fake HEALTHSYNC_CLIENT_SECRET=fake healthsync --help
```
Expected: prints commander help with `auth`, `sync`, `list`, `config` subcommands.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/index.ts packages/cli/src/paths.ts
git commit -m "feat(cli): wire commands, env-based credentials, version"
```

---

## Task 18: E2E integration test (mocked Google APIs)

**Files:**
- Create: `packages/core/tests/e2e-sync.test.ts`

- [ ] **Step 1: Write E2E test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { google } from "googleapis";
import { DriveClient, HealthClient, runSync } from "../src/index.js";

function fakeAuth() {
  const oauth2 = new google.auth.OAuth2("id", "secret");
  oauth2.setCredentials({ access_token: "AT", expiry_date: Date.now() + 3600_000 });
  return oauth2;
}

describe("E2E runSync with mocked Google APIs", () => {
  beforeEach(() => nock.cleanAll());

  it("fetches one day, uploads raw JSON + daily MD to Drive", async () => {
    // --- Google Health API
    const hc = nock("https://health.googleapis.com");
    hc.get("/v1/users/me/steps/read").query(true).reply(200, {
      points: [{ date: "2026-04-19", value: 8432, goal: 10000, distanceMeters: 6100 }],
    });

    // --- Google Drive API
    const dc = nock("https://www.googleapis.com");
    // ensureFolderPath HealthSync → raw → 2026 → 04 (4 missing lookups + 4 creates)
    for (const name of ["HealthSync", "raw", "2026", "04"]) {
      dc.get("/drive/v3/files").query((q) => q.q?.includes(name)).reply(200, { files: [] });
      dc.post("/drive/v3/files").reply(200, { id: `${name}-id`, name });
    }
    // ensureFolderPath daily → 2026 → 04 (4 missing lookups + 4 creates)
    for (const name of ["HealthSync", "daily", "2026", "04"]) {
      dc.get("/drive/v3/files").query((q) => q.q?.includes(name)).reply(200, { files: [] });
      dc.post("/drive/v3/files").reply(200, { id: `${name}-id2`, name });
    }
    // raw JSON upload
    dc.post("/upload/drive/v3/files").query(true).reply(200, { id: "raw-file" });
    // daily MD upload
    dc.post("/upload/drive/v3/files").query(true).reply(200, { id: "md-file" });

    const auth = fakeAuth();
    const state: { lastSync: Record<string, string> } = { lastSync: {} };

    const result = await runSync({
      health: new HealthClient(auth),
      drive: new DriveClient(auth),
      state: {
        async get() { return state; },
        async setType(type, iso) { state.lastSync[type] = iso; },
      },
      types: ["steps"],
      driveRoot: "HealthSync",
      now: new Date("2026-04-20T00:00:00Z"),
    });

    expect(result.perType.steps.status).toBe("ok");
    expect(result.perType.steps.rawFileId).toBe("raw-file");
    expect(result.dailyMarkdownFileId).toBe("md-file");
    expect(state.lastSync.steps).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `pnpm --filter @healthsync/core test tests/e2e-sync`
Expected: 1 passed.

- [ ] **Step 3: Full repo test + typecheck**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: everything green.

- [ ] **Step 4: Commit**

```bash
git add packages/core/tests/e2e-sync.test.ts
git commit -m "test(core): E2E sync happy path with mocked Google APIs"
```

---

## Task 19: README + Google Cloud project setup guide

**Files:**
- Create: `/home/andy/project/HealthSync/README.md`

- [ ] **Step 1: Write `README.md`**

````markdown
# HealthSync

CLI that syncs Pixel Watch health data from the [Google Health API](https://developers.google.com/health) into a Google Drive folder, as both raw JSON archives and Obsidian-friendly Markdown daily notes.

## Prerequisites

- Node.js 22 LTS (`nvm use` reads `.nvmrc`)
- pnpm 9+ (`corepack enable`)
- A Pixel Watch linked to your Google account
- A Google Cloud project with OAuth 2.0 credentials (see below)

## Google Cloud project setup (one-time)

1. Visit <https://console.cloud.google.com/>, create a new project.
2. Enable APIs:
   - Google Health API
   - Google Drive API
3. Configure OAuth consent screen → User Type: **External** → add yourself as a Test User.
4. Credentials → Create OAuth client ID → Application type: **Desktop app**.
5. Download JSON. Export the two values:

```bash
export HEALTHSYNC_CLIENT_ID=<client_id>
export HEALTHSYNC_CLIENT_SECRET=<client_secret>
```

> Note: Google officially recommends waiting until late May 2026 to **publish** integrations with the Google Health API (to align with the Fitbit account deprecation). Development and personal use are fine today.

## Install + build

```bash
pnpm install
pnpm build
```

## Usage

```bash
# First-time authorisation (opens browser, then captures localhost callback)
healthsync connect

# Sync yesterday's data (incremental default)
healthsync sync

# Full backfill from a date
healthsync sync --full --since 2026-01-01

# Only specific types
healthsync sync --types steps,sleep

# Machine-readable output for scripts
healthsync sync --json
```

## Drive layout produced

```
HealthSync/
├── raw/YYYY/MM/YYYY-MM-DD_<type>.json
├── daily/YYYY/MM/YYYY-MM-DD.md
└── .state/sync-state.json
```

Point your Obsidian vault at `daily/` (or a synced local copy) to browse daily notes with working wikilinks.

## Configuration

Optional config file at `~/.config/healthsync/config.json` (Linux/macOS) or `%APPDATA%\healthsync\config.json` (Windows):

```json
{
  "driveRootFolder": "HealthSync",
  "dataTypes": ["steps", "heart-rate", "sleep", "active-zone-minutes", "spo2"],
  "logLevel": "info"
}
```

## Development

```bash
pnpm typecheck
pnpm test
pnpm lint
```

## Architecture

See `docs/superpowers/specs/2026-04-19-healthsync-design.md` for the full design.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup, usage, and Drive layout"
```

---

## Self-Review

1. **Spec coverage:**
   - §3 Goal 1 (OAuth) → Task 8
   - §3 Goal 2 (fetch core types) → Tasks 6, 10
   - §3 Goal 3 (raw JSON to Drive) → Tasks 9, 13
   - §3 Goal 4 (Obsidian Markdown daily note) → Task 12
   - §3 Goal 5 (incremental / `--full` sync) → Tasks 13, 15
   - §3 Goal 6 (`--json` on every command) → Tasks 14, 15, 16
   - §6 monorepo + modules → Tasks 1, 2, 3 + 4–13
   - §7 Drive layout → Tasks 9, 13
   - §8 Markdown format → Task 12
   - §9 auth + token storage + refresh → Task 8
   - §10 retries / rate limit / partial failure → Tasks 10, 13
   - §11 tech stack → Tasks 1, 2, 3
   - §12 success criteria #1–8 → all exercised across Tasks 8, 13, 17, 18 (E2E)
   - §13 open question on scope strings → flagged in Task 8 Step 9 note
   - §14 future work → intentionally excluded from this plan

2. **Placeholder scan:** Each step has either concrete code, concrete commands, or an actionable note with a resolution path. The single note in Task 10 / Task 8 about Google Health scope strings points to a concrete lookup (context7 MCP + live docs) rather than being a placeholder.

3. **Type consistency:**
   - `DataType` alias defined once in `config/schema.ts` and re-exported, used uniformly.
   - `HealthPort`, `DrivePort`, `StatePort` defined in `sync/index.ts` and consumed in `cli/commands/sync.ts` via imports.
   - `StoredTokens` defined in `auth/token-store.ts` and returned from `auth/index.ts`.
   - `CanonicalDay` defined in `transform/json/index.ts` and consumed by all `transform/markdown/sections/*`.
   - `SUPPORTED_DATA_TYPES` constant re-used in config validation and CLI type parsing.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-19-healthsync-cli-mvp.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
