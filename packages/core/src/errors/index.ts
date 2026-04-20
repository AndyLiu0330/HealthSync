export class HealthSyncError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class AuthError extends HealthSyncError {}
export class ConfigError extends HealthSyncError {}
export class StateError extends HealthSyncError {}
export class NetworkError extends HealthSyncError {}

export class RateLimitError extends HealthSyncError {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number, options?: { cause?: unknown }) {
    super(message, options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
