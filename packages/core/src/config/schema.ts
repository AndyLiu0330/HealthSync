export const SUPPORTED_DATA_TYPES = [
  "steps",
  "heart-rate",
  "sleep",
  "active-zone-minutes",
  "spo2",
] as const;

export type DataType = (typeof SUPPORTED_DATA_TYPES)[number];

export const VALID_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof VALID_LOG_LEVELS)[number];

export interface HealthSyncConfig {
  driveRootFolder: string;
  dataTypes: DataType[];
  logLevel: LogLevel;
}

export const DEFAULT_CONFIG: HealthSyncConfig = {
  driveRootFolder: "HealthSync",
  dataTypes: [...SUPPORTED_DATA_TYPES],
  logLevel: "info",
};
