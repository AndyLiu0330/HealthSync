import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFile } from "./env.js";

const KEYS = ["HEALTHSYNC_CLIENT_ID", "HEALTHSYNC_CLIENT_SECRET"] as const;

describe("loadEnvFile", () => {
  afterEach(() => {
    for (const key of KEYS) delete process.env[key];
  });

  it("loads credentials from .env without overriding existing environment variables", async () => {
    const dir = await mkdtemp(join(tmpdir(), "healthsync-env-"));
    await writeFile(
      join(dir, ".env"),
      ["HEALTHSYNC_CLIENT_ID=from-env-file", "HEALTHSYNC_CLIENT_SECRET=from-env-file", ""].join(
        "\n",
      ),
    );
    process.env.HEALTHSYNC_CLIENT_SECRET = "from-shell";

    loadEnvFile(join(dir, ".env"));

    expect(process.env.HEALTHSYNC_CLIENT_ID).toBe("from-env-file");
    expect(process.env.HEALTHSYNC_CLIENT_SECRET).toBe("from-shell");
  });
});
