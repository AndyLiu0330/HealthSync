import { describe, expect, it } from "vitest";
import { captureAuthCode } from "./loopback.js";

describe("captureAuthCode", () => {
  it("resolves with the code when the browser hits /callback?code=...", async () => {
    const capture = captureAuthCode({ state: "xyz" });
    const { port, promise } = await capture.ready;

    // simulate the browser callback
    const res = await fetch(`http://127.0.0.1:${port}/callback?code=ABC&state=xyz`);
    expect(res.status).toBe(200);

    const code = await promise;
    expect(code).toBe("ABC");
  });

  it("rejects when state mismatches", async () => {
    const capture = captureAuthCode({ state: "xyz" });
    const { port, promise } = await capture.ready;
    await fetch(`http://127.0.0.1:${port}/callback?code=ABC&state=WRONG`);
    await expect(promise).rejects.toThrow(/state mismatch/i);
  });
});
