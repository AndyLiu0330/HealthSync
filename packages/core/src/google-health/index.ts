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

const DEFAULT_BASE = "https://health.googleapis.com/v1";

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
