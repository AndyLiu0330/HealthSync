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
    case "steps": {
      const counts = result.points
        .map((p) => asNumber(asObject(p)?.steps, "count"))
        .filter(isNumber);
      if (counts.length > 0) {
        return { date, steps: { total: sum(counts) } };
      }
      return {
        date,
        steps: {
          total: num(point.value),
          ...defined("goal", opt(point.goal)),
          ...defined("distanceMeters", opt(point.distanceMeters)),
          ...defined("activeMinutes", opt(point.activeMinutes)),
        },
      };
    }
    case "heart-rate": {
      const samples = result.points
        .map((p) => asNumber(asObject(p)?.heartRate, "beatsPerMinute"))
        .filter(isNumber);
      if (samples.length > 0) {
        return {
          date,
          heartRate: {
            average: Math.round(sum(samples) / samples.length),
            max: Math.max(...samples),
          },
        };
      }
      return {
        date,
        heartRate: {
          ...defined("resting", opt(point.resting)),
          ...defined("average", opt(point.average)),
          ...defined("max", opt(point.max)),
        },
      };
    }
    case "sleep": {
      const sleeps = result.points.map((p) => asObject(asObject(p)?.sleep)).filter(isObject);
      if (sleeps.length > 0) {
        return { date, sleep: summarizeV4Sleep(sleeps) };
      }
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
    case "active-zone-minutes": {
      const zones = result.points
        .map((p) => asObject(asObject(p)?.activeZoneMinutes))
        .filter(isObject);
      if (zones.length > 0) {
        return { date, activeZoneMinutes: summarizeV4ActiveZoneMinutes(zones) };
      }
      return {
        date,
        activeZoneMinutes: {
          ...defined("total", opt(point.total)),
          ...defined("fatBurn", opt(point.fatBurn)),
          ...defined("cardio", opt(point.cardio)),
          ...defined("peak", opt(point.peak)),
        },
      };
    }
    case "spo2": {
      const dailyAverages = result.points
        .map((p) => asNumber(asObject(p)?.dailyOxygenSaturation, "averagePercentage"))
        .filter(isNumber);
      if (dailyAverages.length > 0) {
        return { date, spo2: { averageOvernight: average(dailyAverages) } };
      }
      const samples = result.points
        .map((p) => asNumber(asObject(p)?.oxygenSaturation, "percentage"))
        .filter(isNumber);
      if (samples.length > 0) {
        return { date, spo2: { averageOvernight: average(samples) } };
      }
      return {
        date,
        spo2: { ...defined("averageOvernight", opt(point.averageOvernight)) },
      };
    }
  }
}

export function mergeCanonical(days: CanonicalDay[]): CanonicalDay {
  if (days.length === 0) throw new Error("mergeCanonical: empty input");
  const [first] = days;
  if (!first) throw new Error("mergeCanonical: empty input");
  const base: CanonicalDay = { date: first.date };
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

function summarizeV4Sleep(points: Record<string, unknown>[]): NonNullable<CanonicalDay["sleep"]> {
  const stageTotals: Record<"awake" | "deep" | "light" | "rem", number> = {
    awake: 0,
    deep: 0,
    light: 0,
    rem: 0,
  };
  let durationMinutes = 0;
  let hasDuration = false;
  let hasStages = false;

  for (const sleep of points) {
    const summary = asObject(sleep.summary);
    const minutesAsleep = numberValue(summary?.minutesAsleep);
    if (minutesAsleep !== undefined) {
      durationMinutes += minutesAsleep;
      hasDuration = true;
    }
    const stagesSummary = Array.isArray(summary?.stagesSummary) ? summary.stagesSummary : [];
    for (const item of stagesSummary) {
      const stage = asObject(item);
      const key = stageKey(stage?.type);
      const minutes = numberValue(stage?.minutes);
      if (key && minutes !== undefined) {
        stageTotals[key] += minutes;
        hasStages = true;
      }
    }
  }

  return {
    ...defined("durationMinutes", hasDuration ? durationMinutes : undefined),
    ...(hasStages
      ? {
          stages: {
            ...defined("awake", nonZero(stageTotals.awake)),
            ...defined("deep", nonZero(stageTotals.deep)),
            ...defined("light", nonZero(stageTotals.light)),
            ...defined("rem", nonZero(stageTotals.rem)),
          },
        }
      : {}),
  };
}

function summarizeV4ActiveZoneMinutes(
  points: Record<string, unknown>[],
): NonNullable<CanonicalDay["activeZoneMinutes"]> {
  let total = 0;
  let fatBurn = 0;
  let cardio = 0;
  let peak = 0;

  for (const point of points) {
    const minutes = numberValue(point.activeZoneMinutes);
    if (minutes === undefined) continue;
    total += minutes;
    switch (point.heartRateZone) {
      case "FAT_BURN":
        fatBurn += minutes;
        break;
      case "CARDIO":
        cardio += minutes;
        break;
      case "PEAK":
        peak += minutes;
        break;
    }
  }

  return {
    ...defined("total", nonZero(total)),
    ...defined("fatBurn", nonZero(fatBurn)),
    ...defined("cardio", nonZero(cardio)),
    ...defined("peak", nonZero(peak)),
  };
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return isObject(v) ? v : undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, key: string): number | undefined {
  return numberValue(asObject(v)?.[key]);
}

function numberValue(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return undefined;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isNumber(v: number | undefined): v is number {
  return v !== undefined;
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function average(values: number[]): number {
  return sum(values) / values.length;
}

function nonZero(v: number): number | undefined {
  return v === 0 ? undefined : v;
}

function stageKey(v: unknown): "awake" | "deep" | "light" | "rem" | undefined {
  switch (v) {
    case "AWAKE":
      return "awake";
    case "DEEP":
      return "deep";
    case "LIGHT":
      return "light";
    case "REM":
      return "rem";
    default:
      return undefined;
  }
}
