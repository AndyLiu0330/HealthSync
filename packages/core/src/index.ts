export const version = "0.0.0";
export * from "./errors/index.js";
export {
  createLogger,
  type Logger,
  type LoggerOptions,
  type LogMode,
} from "./logger/index.js";
export * from "./config/index.js";
export * from "./state/index.js";
export * as auth from "./auth/index.js";
export { DriveClient } from "./google-drive/index.js";
export { HealthClient } from "./google-health/index.js";
export { toCanonical, mergeCanonical, type CanonicalDay } from "./transform/json/index.js";
export { renderDailyNote } from "./transform/markdown/index.js";
export {
  runSync,
  type HealthPort,
  type DrivePort,
  type StatePort,
  type RunSyncParams,
  type RunSyncResult,
  type PerTypeResult,
} from "./sync/index.js";
export {
  renderDashboard,
  type DashboardRange,
  type RenderDashboardParams,
} from "./report/render.js";
export {
  runDashboard,
  type DashboardDrivePort,
  type RunDashboardParams,
  type RunDashboardResult,
} from "./report/run.js";
