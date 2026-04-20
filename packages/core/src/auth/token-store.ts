import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AuthError } from "../errors/index.js";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
}

export async function loadTokens(path: string): Promise<StoredTokens | null> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as StoredTokens;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new AuthError(`failed to read tokens at ${path}`, { cause: err });
  }
}

export async function saveTokens(path: string, tokens: StoredTokens): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, path);
}
