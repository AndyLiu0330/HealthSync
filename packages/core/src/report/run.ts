import { type DataType, SUPPORTED_DATA_TYPES } from "../config/index.js";
import type { DataTypeResult } from "../google-health/types.js";
import { type DrivePort, type HealthPort, type StatePort, runSync } from "../sync/index.js";
import { type CanonicalDay, mergeCanonical, toCanonical } from "../transform/json/index.js";
import { renderDailyNote } from "../transform/markdown/index.js";
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

  // Dashboard backfills missing days in ascending date order, but a "missing" day can be
  // older than a day that's already synced. If we let runSync's setType calls hit the real
  // state port directly, backfilling an old hole after a newer day is synced would leave
  // lastSync[type] pointing at the older timestamp. Nothing reads lastSync today, but it
  // would plant wrong state for the next incremental sync. Guard it: only forward setType
  // writes that move a type's timestamp forward.
  const latestSync: Partial<Record<DataType, string>> = { ...(await p.state.get()).lastSync };
  const guardedState: StatePort = {
    get: () => p.state.get(),
    setType: async (type, iso) => {
      const current = latestSync[type];
      if (current !== undefined && iso <= current) return;
      latestSync[type] = iso;
      await p.state.setType(type, iso);
    },
  };

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
  const missingTypesFor = (date: string): DataType[] => {
    const files = filesByMonth.get(ymOf(date)) ?? [];
    return p.types.filter((t) => !files.some((f) => f.name === `${date}_${t}.json`));
  };

  const syncedDates: string[] = [];
  const errors: RunDashboardResult["errors"] = [];
  for (const date of dates) {
    const missingTypes = missingTypesFor(date);
    if (missingTypes.length === 0) continue;
    const nextMidnight = new Date(Date.parse(`${date}T00:00:00.000Z`) + DAY_MS);
    const res = await runSync({
      health: p.health,
      drive: p.drive,
      state: guardedState,
      types: missingTypes,
      driveRoot: p.driveRoot,
      now: nextMidnight,
      skipDailyNote: true,
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
      // A transient Drive error, corrupt JSON, or a malformed point must not abort the
      // whole run — skip the bad file so the day renders as a gap instead.
      try {
        const body = await p.drive.downloadJSON(f.id);
        if (isDataTypeResult(body)) canonical.push(toCanonical(body));
      } catch {
        // skip: missing data -> gap, never a crash
      }
    }
    days.push(canonical.length > 0 ? { ...mergeCanonical(canonical), date } : { date });
  }

  // Rebuild the complete daily note for each backfilled date from the merged canonical day
  // (old + newly-synced raw files), overwriting the single existing note instead of runSync
  // uploading a second, partial one for the same date.
  const dailyFolders = new Map<string, string>(); // "YYYY/MM" -> folderId
  for (const date of syncedDates) {
    const day = days.find((d) => d.date === date);
    if (!day || Object.keys(day).length <= 1) continue;
    try {
      const ym = ymOf(date);
      let folderId = dailyFolders.get(ym);
      if (!folderId) {
        const [y, m] = ym.split("/") as [string, string];
        folderId = await p.drive.ensureFolderPath([p.driveRoot, "daily", y, m]);
        dailyFolders.set(ym, folderId);
      }
      const body = renderDailyNote(day);
      const existing = await p.drive.findChild(folderId, `${date}.md`);
      await p.drive.uploadMarkdown({
        parentId: folderId,
        name: `${date}.md`,
        body,
        ...(existing ? { overwriteFileId: existing } : {}),
      });
    } catch (err) {
      errors.push({ date, type: "daily-note", error: (err as Error).message });
    }
  }

  const html = renderDashboard({
    range: p.range,
    days,
    generatedAt: p.now.toISOString(),
    types: p.types,
  });
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
