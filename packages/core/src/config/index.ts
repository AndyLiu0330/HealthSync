import { readFile } from "node:fs/promises";
import { ConfigError } from "../errors/index.js";
import {
  DEFAULT_CONFIG,
  type DataType,
  type HealthSyncConfig,
  type LogLevel,
  SUPPORTED_DATA_TYPES,
  VALID_LOG_LEVELS,
} from "./schema.js";

export { DEFAULT_CONFIG, SUPPORTED_DATA_TYPES, VALID_LOG_LEVELS };
export type { DataType, HealthSyncConfig, LogLevel };

export async function loadConfig(path: string): Promise<HealthSyncConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...DEFAULT_CONFIG, dataTypes: [...DEFAULT_CONFIG.dataTypes] };
    }
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

  const merged: HealthSyncConfig = {
    ...DEFAULT_CONFIG,
    dataTypes: [...DEFAULT_CONFIG.dataTypes],
    ...(parsed as Partial<HealthSyncConfig>),
  };

  if (typeof merged.driveRootFolder !== "string") {
    throw new ConfigError(`driveRootFolder must be a string`);
  }
  if (!(VALID_LOG_LEVELS as readonly string[]).includes(merged.logLevel)) {
    throw new ConfigError(
      `logLevel must be one of: ${VALID_LOG_LEVELS.join(", ")}`,
    );
  }
  if (!Array.isArray(merged.dataTypes)) {
    throw new ConfigError(`dataTypes must be an array`);
  }

  const supported: readonly string[] = SUPPORTED_DATA_TYPES;
  for (const t of merged.dataTypes as unknown[]) {
    if (typeof t !== "string" || !supported.includes(t)) {
      throw new ConfigError(`unknown data type in config: ${String(t)}`);
    }
  }
  return merged;
}
