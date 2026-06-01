import { createServer } from "node:http";
import { Agent, get } from "node:http";
import { describe, expect, it } from "vitest";
import { captureAuthCode } from "./loopback.js";

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("expected TCP address");
  const { port } = address;
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  return port;
}

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

  it("listens on the requested port", async () => {
    const requestedPort = await getFreePort();
    const capture = captureAuthCode({ state: "xyz", port: requestedPort });
    const { port, promise } = await capture.ready;

    expect(port).toBe(requestedPort);
    const res = await fetch(`http://127.0.0.1:${port}/callback?code=ABC&state=xyz`);
    expect(res.status).toBe(200);
    await expect(promise).resolves.toBe("ABC");
  });

  it("closes keep-alive callback sockets after resolving", async () => {
    const capture = captureAuthCode({ state: "xyz" });
    const { port, promise } = await capture.ready;
    const agent = new Agent({ keepAlive: true });
    let socketClosed = false;

    await new Promise<void>((resolve, reject) => {
      const req = get(
        {
          agent,
          headers: { connection: "keep-alive" },
          hostname: "127.0.0.1",
          path: "/callback?code=ABC&state=xyz",
          port,
        },
        (res) => {
          res.resume();
          res.on("end", resolve);
        },
      );
      req.on("socket", (socket) => {
        socket.once("close", () => {
          socketClosed = true;
        });
      });
      req.on("error", reject);
    });

    await expect(promise).resolves.toBe("ABC");
    await new Promise((resolve) => setTimeout(resolve, 25));
    agent.destroy();

    expect(socketClosed).toBe(true);
  });

  it("rejects when state mismatches", async () => {
    const capture = captureAuthCode({ state: "xyz" });
    const { port, promise } = await capture.ready;
    await fetch(`http://127.0.0.1:${port}/callback?code=ABC&state=WRONG`);
    await expect(promise).rejects.toThrow(/state mismatch/i);
  });
});
