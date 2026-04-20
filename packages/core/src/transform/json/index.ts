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
          ...defined("goal", opt(point.goal)),
          ...defined("distanceMeters", opt(point.distanceMeters)),
          ...defined("activeMinutes", opt(point.activeMinutes)),
        },
      };
    case "heart-rate":
      return {
        date,
        heartRate: {
          ...defined("resting", opt(point.resting)),
          ...defined("average", opt(point.average)),
          ...defined("max", opt(point.max)),
        },
      };
    case "sleep": {
      const stagesSrc = point.stages as Record<string, unknown> | undefined;
      const stages = {
        ...defined("deep", opt(stagesSrc?.deep)),
        ...defined("rem", opt(stagesSrc?.rem)),
        ...defined("light", opt(stagesSrc?.light)),
        ...defined("awake", opt(stagesSrc?.awake)),
      };
      return {
        date,
        sleep: {
          ...defined("durationMinutes", opt(point.durationMinutes)),
          ...defined("score", opt(point.score)),
          ...(Object.keys(stages).length > 0 ? { stages } : {}),
        },
      };
    }
    case "active-zone-minutes":
      return {
        date,
        activeZoneMinutes: {
          ...defined("total", opt(point.total)),
          ...defined("fatBurn", opt(point.fatBurn)),
          ...defined("cardio", opt(point.cardio)),
          ...defined("peak", opt(point.peak)),
        },
      };
    case "spo2":
      return {
        date,
        spo2: { ...defined("averageOvernight", opt(point.averageOvernight)) },
      };
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
function defined<K extends string>(
  key: K,
  v: number | undefined,
): Record<K, number> | Record<string, never> {
  return v === undefined ? {} : ({ [key]: v } as Record<K, number>);
}
