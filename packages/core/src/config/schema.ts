export const SUPPORTED_DATA_TYPES = [
  "steps",
  "heart-rate",
  "sleep",
  "active-zone-minutes",
  "spo2",
] as const;

export type DataType = (typeof SUPPORTED_DATA_TYPES)[number];

export interface HealthSyncConfig {
  driveRootFolder: string;
  dataTypes: DataType[];
  logLevel: "debug" | "info" | "warn" | "error";
}

export const DEFAULT_CONFIG: HealthSyncConfig = {
  driveRootFolder: "HealthSync",
  dataTypes: [...SUPPORTED_DATA_TYPES],
  logLevel: "info",
};
