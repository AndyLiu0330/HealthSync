import { homedir } from "node:os";
import { join } from "node:path";

export function configDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA
      ? join(process.env.APPDATA, "healthsync")
      : join(homedir(), "AppData", "Roaming", "healthsync");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "healthsync") : join(homedir(), ".config", "healthsync");
}

export function tokensPath(): string {
  return join(configDir(), "tokens.json");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function statePath(): string {
  return join(configDir(), "sync-state.json");
}

export function dashboardPath(): string {
  return join(configDir(), "dashboard.html");
}
