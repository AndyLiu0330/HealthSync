export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogMode = "human" | "json";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface LoggerOptions {
  mode: LogMode;
  level: LogLevel;
}

export function createLogger(opts: LoggerOptions): Logger {
  const threshold = LEVEL_ORDER[opts.level];

  function write(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < threshold) return;
    if (opts.mode === "json") {
      const record = { time: new Date().toISOString(), level, msg, ...(fields ?? {}) };
      process.stdout.write(`${JSON.stringify(record)}\n`);
    } else {
      const extra = fields ? ` ${JSON.stringify(fields)}` : "";
      process.stderr.write(`${level.toUpperCase()} ${msg}${extra}\n`);
    }
  }

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
  };
}
