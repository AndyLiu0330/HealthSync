import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export function defaultEnvPath(): string {
  return fileURLToPath(new URL("../../../.env", import.meta.url));
}

export function loadEnvFile(path = defaultEnvPath()): void {
  config({ path, override: false, quiet: true });
}
