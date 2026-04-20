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
