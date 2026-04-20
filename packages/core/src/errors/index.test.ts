import { describe, expect, it } from "vitest";
import {
  AuthError,
  ConfigError,
  HealthSyncError,
  NetworkError,
  RateLimitError,
  StateError,
} from "./index.js";

describe("HealthSync error classes", () => {
  it("all errors inherit from HealthSyncError and keep their name", () => {
    const cases = [
      new AuthError("bad token"),
      new ConfigError("missing field"),
      new NetworkError("timeout"),
      new RateLimitError("slow down", 30),
      new StateError("corrupt state"),
    ];
    for (const err of cases) {
      expect(err).toBeInstanceOf(HealthSyncError);
      expect(err.name).toBe(err.constructor.name);
      expect(err.message.length).toBeGreaterThan(0);
    }
  });

  it("RateLimitError carries retryAfterSeconds", () => {
    const err = new RateLimitError("slow down", 42);
    expect(err.retryAfterSeconds).toBe(42);
  });

  it("errors preserve cause when provided", () => {
    const cause = new Error("underlying");
    const err = new NetworkError("wrapped", { cause });
    expect(err.cause).toBe(cause);
  });
});
