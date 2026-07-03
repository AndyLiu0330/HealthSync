import type { DataType } from "../config/index.js";
import { type CanonicalDay, mergeCanonical, toCanonical } from "../transform/json/index.js";
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
  skipDailyNote?: boolean;
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
      const canonical = toCanonical({
        type: result.type,
        startTime: result.startTime,
        endTime: result.endTime,
        points: result.points as Record<string, unknown>[],
      });
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
  if (!p.skipDailyNote && successfulDays.length > 0) {
    const merged = mergeCanonical(successfulDays);
    const md = renderDailyNote(merged);
    dailyMarkdownFileId = await p.drive.uploadMarkdown({
      parentId: dailyFolder,
      name: `${dateKey}.md`,
      body: md,
    });
  }

  return {
    date: dateKey,
    perType,
    ...(dailyMarkdownFileId !== undefined ? { dailyMarkdownFileId } : {}),
  };
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
    case "calories":
      return day.calories !== undefined;
    case "resting-heart-rate":
      return day.restingHeartRate !== undefined;
    case "heart-rate-variability":
      return day.heartRateVariability !== undefined;
    case "respiratory-rate":
      return day.respiratoryRate !== undefined;
  }
}
