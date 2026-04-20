import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./index.js";

describe("createLogger", () => {
  it("human mode prints level + message to stderr", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger({ mode: "human", level: "info" });
    logger.info("hello", { foo: 1 });
    expect(err).toHaveBeenCalled();
    const line = String(err.mock.calls[0]?.[0] ?? "");
    expect(line).toContain("INFO");
    expect(line).toContain("hello");
    err.mockRestore();
  });

  it("json mode prints NDJSON to stdout", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const logger = createLogger({ mode: "json", level: "debug" });
    logger.warn("oops", { code: 7 });
    const line = String(out.mock.calls[0]?.[0] ?? "");
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("oops");
    expect(parsed.code).toBe(7);
    expect(typeof parsed.time).toBe("string");
    out.mockRestore();
  });

  it("filters messages below configured level", () => {
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const logger = createLogger({ mode: "human", level: "warn" });
    logger.debug("ignored");
    logger.info("ignored");
    logger.warn("shown");
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
