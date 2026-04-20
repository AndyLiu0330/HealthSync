import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError } from "../errors/index.js";
import { DEFAULT_CONFIG, loadConfig } from "./index.js";

async function tmpDir() {
  return mkdtemp(join(tmpdir(), "healthsync-cfg-"));
}

describe("loadConfig", () => {
  it("returns DEFAULT_CONFIG when file missing", async () => {
    const dir = await tmpDir();
    const cfg = await loadConfig(join(dir, "config.json"));
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it("merges user config over defaults", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ driveRootFolder: "MyHealth" }));
    const cfg = await loadConfig(path);
    expect(cfg.driveRootFolder).toBe("MyHealth");
    expect(cfg.dataTypes).toEqual(DEFAULT_CONFIG.dataTypes);
  });

  it("throws ConfigError on invalid JSON", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, "{not json");
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigError);
  });

  it("throws ConfigError on unknown dataTypes entry", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ dataTypes: ["steps", "bogus"] }));
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigError);
  });

  it("throws ConfigError when driveRootFolder is not a string", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ driveRootFolder: 42 }));
    await expect(loadConfig(path)).rejects.toThrow(/driveRootFolder/);
  });

  it("throws ConfigError when logLevel is unknown", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ logLevel: "TRACE" }));
    await expect(loadConfig(path)).rejects.toThrow(/logLevel/);
  });

  it("throws ConfigError when dataTypes is not an array", async () => {
    const dir = await tmpDir();
    const path = join(dir, "config.json");
    await writeFile(path, JSON.stringify({ dataTypes: "steps" }));
    await expect(loadConfig(path)).rejects.toThrow(/dataTypes must be an array/);
  });
});
