import { describe, expect, it } from "vitest";
import { version } from "./index.js";

describe("core package health check", () => {
  it("exposes a version string", () => {
    expect(version).toBe("0.0.0");
  });
});
