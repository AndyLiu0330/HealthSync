import { describe, expect, it, vi } from "vitest";
import { buildListCommand } from "./list.js";

describe("list command", () => {
  it("prints each file under raw/ as JSON array", async () => {
    const drive = {
      ensureFolderPath: vi.fn(async () => "folder-id"),
      listChildren: vi.fn(async () => [
        { id: "a", name: "2026-04-19_steps.json" },
        { id: "b", name: "2026-04-19_sleep.json" },
      ]),
    };
    const out: string[] = [];
    const cmd = buildListCommand({
      buildDrive: async () => ({ drive: drive as never, driveRoot: "HealthSync" }),
      writeLine: (s) => out.push(s),
    });
    await cmd.parseAsync(["node", "healthsync", "--json"]);
    const parsed = JSON.parse(out[out.length - 1] ?? "[]");
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("2026-04-19_steps.json");
  });
});
