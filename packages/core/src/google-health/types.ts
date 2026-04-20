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
