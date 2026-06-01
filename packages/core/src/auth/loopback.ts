import { type IncomingMessage, type ServerResponse, createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { AuthError } from "../errors/index.js";

export interface LoopbackCapture {
  ready: Promise<{ port: number; promise: Promise<string> }>;
  cancel(): void;
}

export function captureAuthCode(opts: { state: string; port?: number }): LoopbackCapture {
  let resolve!: (code: string) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Silence Node's unhandledRejection tracker; consumers who `await` the
  // returned promise still observe the rejection via their own handler.
  promise.catch(() => {});

  const sockets = new Set<Socket>();
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) return;
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (state !== opts.state) {
      res.statusCode = 400;
      res.end("state mismatch", () => {
        reject(new AuthError("OAuth state mismatch — possible CSRF"));
        closeServer(server, sockets);
      });
      return;
    }
    if (!code) {
      res.statusCode = 400;
      res.end("missing code", () => {
        reject(new AuthError("OAuth callback missing code"));
        closeServer(server, sockets);
      });
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end("<html><body><h1>Authorised</h1>You may close this tab.</body></html>", () => {
      resolve(code);
      closeServer(server, sockets);
    });
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  const ready = new Promise<{ port: number; promise: Promise<string> }>((readyResolve) => {
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      readyResolve({ port, promise });
    });
  });

  return {
    ready,
    cancel() {
      reject(new AuthError("loopback capture cancelled"));
      closeServer(server, sockets);
    },
  };
}

function closeServer(server: ReturnType<typeof createServer>, sockets: Set<Socket>): void {
  server.close();
  for (const socket of sockets) {
    socket.destroy();
  }
}
