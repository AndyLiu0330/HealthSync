import { readFile } from "node:fs/promises";
import { ConfigError } from "../errors/index.js";
import {
  DEFAULT_CONFIG,
  type DataType,
  type HealthSyncConfig,
  SUPPORTED_DATA_TYPES,
} from "./schema.js";

export { DEFAULT_CONFIG, SUPPORTED_DATA_TYPES };
export type { DataType, HealthSyncConfig };

export async function loadConfig(path: string): Promise<HealthSyncConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
    throw new ConfigError(`failed to read config at ${path}`, { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`invalid JSON in config ${path}`, { cause: err });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ConfigError(`config must be a JSON object: ${path}`);
  }

  const merged: HealthSyncConfig = { ...DEFAULT_CONFIG, ...(parsed as Partial<HealthSyncConfig>) };

  for (const t of merged.dataTypes) {
    if (!SUPPORTED_DATA_TYPES.includes(t as DataType)) {
      throw new ConfigError(`unknown data type in config: ${t}`);
    }
  }
  return merged;
}
