import type { DataType } from "../config/index.js";
import { NetworkError, RateLimitError } from "../errors/index.js";
import type { DataTypeResult, RawDataPoint } from "./types.js";

export interface AccessTokenProvider {
  getAccessToken(): Promise<{ token?: string | null }>;
}

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

const DEFAULT_BASE = "https://health.googleapis.com/v4";

interface TypeQuery {
  dataType: string;
  pageSize: number;
}

interface ListTypeQuery extends TypeQuery {
  requestKind: "list";
  filter: string;
}

interface DailyRollupTypeQuery extends TypeQuery {
  requestKind: "dailyRollUp";
  range: {
    startDate: { year: number; month: number; day: number };
    endDate: { year: number; month: number; day: number };
  };
}

interface DataPointsResponse {
  dataPoints?: RawDataPoint[];
  rollupDataPoints?: RawDataPoint[];
  nextPageToken?: string;
}

const TYPE_QUERIES: Record<
  DataType,
  Omit<TypeQuery, "filter"> & {
    filterField: string;
    kind: "daily" | "interval" | "sample" | "sleep" | "dailyRollup";
  }
> = {
  "active-zone-minutes": {
    dataType: "active-zone-minutes",
    filterField: "active_zone_minutes",
    kind: "interval",
    pageSize: 10000,
  },
  calories: {
    dataType: "total-calories",
    filterField: "total_calories",
    kind: "dailyRollup",
    pageSize: 10000,
  },
  "heart-rate": {
    dataType: "heart-rate",
    filterField: "heart_rate",
    kind: "sample",
    pageSize: 10000,
  },
  "heart-rate-variability": {
    dataType: "daily-heart-rate-variability",
    filterField: "daily_heart_rate_variability",
    kind: "daily",
    pageSize: 10000,
  },
  "respiratory-rate": {
    dataType: "daily-respiratory-rate",
    filterField: "daily_respiratory_rate",
    kind: "daily",
    pageSize: 10000,
  },
  "resting-heart-rate": {
    dataType: "daily-resting-heart-rate",
    filterField: "daily_resting_heart_rate",
    kind: "daily",
    pageSize: 10000,
  },
  sleep: {
    dataType: "sleep",
    filterField: "sleep",
    kind: "sleep",
    pageSize: 25,
  },
  spo2: {
    dataType: "daily-oxygen-saturation",
    filterField: "daily_oxygen_saturation",
    kind: "daily",
    pageSize: 10000,
  },
  steps: {
    dataType: "steps",
    filterField: "steps",
    kind: "interval",
    pageSize: 10000,
  },
};

export class HealthClient {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly baseUrl: string;

  constructor(
    private readonly auth: AccessTokenProvider,
    opts: HealthClientOptions = {},
  ) {
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
  }

  async fetch(p: FetchParams): Promise<DataTypeResult> {
    const query = buildTypeQuery(p);
    const points: RawDataPoint[] = [];
    let pageToken: string | undefined;

    do {
      const data: DataPointsResponse =
        query.requestKind === "dailyRollUp"
          ? await this.request<DataPointsResponse>(
              new URL(`${this.baseUrl}/users/me/dataTypes/${query.dataType}/dataPoints:dailyRollUp`),
              {
                method: "POST",
                body: JSON.stringify({
                  range: query.range,
                  pageSize: query.pageSize,
                  ...(pageToken ? { pageToken } : {}),
                }),
              },
            )
          : await this.request<DataPointsResponse>(buildListUrl(this.baseUrl, query, pageToken));

      points.push(...(data.rollupDataPoints ?? data.dataPoints ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    return {
      type: p.type,
      startTime: p.startTime,
      endTime: p.endTime,
      points,
    };
  }

  private async request<T>(url: URL, init: RequestInit = {}): Promise<T> {
    const { token } = await this.auth.getAccessToken();
    if (!token) throw new NetworkError("no access token available");

    let attempt = 0;
    while (true) {
      const res = await fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });
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

function buildTypeQuery(p: FetchParams): ListTypeQuery | DailyRollupTypeQuery {
  const cfg = TYPE_QUERIES[p.type];
  const startDate = p.startTime.slice(0, 10);
  const endDate = p.endTime.slice(0, 10);

  switch (cfg.kind) {
    case "daily":
      return {
        requestKind: "list",
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.date >= "${startDate}" AND ${cfg.filterField}.date < "${endDate}"`,
        pageSize: cfg.pageSize,
      };
    case "interval":
      return {
        requestKind: "list",
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.interval.start_time >= "${p.startTime}" AND ${cfg.filterField}.interval.start_time < "${p.endTime}"`,
        pageSize: cfg.pageSize,
      };
    case "sample":
      return {
        requestKind: "list",
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.sample_time.physical_time >= "${p.startTime}" AND ${cfg.filterField}.sample_time.physical_time < "${p.endTime}"`,
        pageSize: cfg.pageSize,
      };
    case "sleep":
      return {
        requestKind: "list",
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.interval.end_time >= "${p.startTime}" AND ${cfg.filterField}.interval.end_time < "${p.endTime}"`,
        pageSize: cfg.pageSize,
      };
    case "dailyRollup":
      return {
        requestKind: "dailyRollUp",
        dataType: cfg.dataType,
        pageSize: cfg.pageSize,
        range: {
          startDate: parseCivilDate(startDate),
          endDate: parseCivilDate(endDate),
        },
      };
  }
}

function buildListUrl(baseUrl: string, query: ListTypeQuery, pageToken?: string): URL {
  const url = new URL(`${baseUrl}/users/me/dataTypes/${query.dataType}/dataPoints`);
  url.searchParams.set("pageSize", String(query.pageSize));
  url.searchParams.set("filter", query.filter);
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
}

function parseCivilDate(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}
