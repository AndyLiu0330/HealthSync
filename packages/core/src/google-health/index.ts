import type { Auth } from "googleapis";
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

const DEFAULT_BASE = "https://health.googleapis.com/v4";

interface TypeQuery {
  dataType: string;
  filter: string;
  pageSize: number;
}

const TYPE_QUERIES: Record<
  DataType,
  Omit<TypeQuery, "filter"> & {
    filterField: string;
    kind: "daily" | "interval" | "sample" | "sleep";
  }
> = {
  "active-zone-minutes": {
    dataType: "active-zone-minutes",
    filterField: "active_zone_minutes",
    kind: "interval",
    pageSize: 10000,
  },
  "heart-rate": {
    dataType: "heart-rate",
    filterField: "heart_rate",
    kind: "sample",
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
    private readonly auth: Auth.OAuth2Client,
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
      const url = new URL(`${this.baseUrl}/users/me/dataTypes/${query.dataType}/dataPoints`);
      url.searchParams.set("pageSize", String(query.pageSize));
      url.searchParams.set("filter", query.filter);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const data = await this.request<{
        dataPoints?: RawDataPoint[];
        nextPageToken?: string;
      }>(url);
      points.push(...(data.dataPoints ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    return {
      type: p.type,
      startTime: p.startTime,
      endTime: p.endTime,
      points,
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

function buildTypeQuery(p: FetchParams): TypeQuery {
  const cfg = TYPE_QUERIES[p.type];
  const startDate = p.startTime.slice(0, 10);
  const endDate = p.endTime.slice(0, 10);

  switch (cfg.kind) {
    case "daily":
      return {
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.date >= "${startDate}" AND ${cfg.filterField}.date < "${endDate}"`,
        pageSize: cfg.pageSize,
      };
    case "interval":
      return {
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.interval.start_time >= "${p.startTime}" AND ${cfg.filterField}.interval.start_time < "${p.endTime}"`,
        pageSize: cfg.pageSize,
      };
    case "sample":
      return {
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.sample_time.physical_time >= "${p.startTime}" AND ${cfg.filterField}.sample_time.physical_time < "${p.endTime}"`,
        pageSize: cfg.pageSize,
      };
    case "sleep":
      return {
        dataType: cfg.dataType,
        filter: `${cfg.filterField}.interval.end_time >= "${p.startTime}" AND ${cfg.filterField}.interval.end_time < "${p.endTime}"`,
        pageSize: cfg.pageSize,
      };
  }
}
