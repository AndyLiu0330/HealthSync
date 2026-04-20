import { describe, expect, it, vi } from "vitest";
import { buildAuthCommand } from "./auth.js";

describe("auth command", () => {
  it("status prints { authenticated: false } when no tokens", async () => {
    const out: string[] = [];
    const cmd = buildAuthCommand({
      paths: { tokens: "/tmp/does-not-exist-xyz.json" },
      credentials: { clientId: "x", clientSecret: "y" },
      writeLine: (s) => out.push(s),
      openBrowser: vi.fn(),
    });
    await cmd.parseAsync(["node", "healthsync", "status", "--json"]);
    const last = JSON.parse(out[out.length - 1] ?? "{}");
    expect(last).toEqual({ authenticated: false });
  });
});
