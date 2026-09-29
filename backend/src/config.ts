import { resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  logLevel: string;
  controlToken?: string;
  overlayToken?: string;
  publicUrl?: string;
  staticDir: string;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function loadConfig(): Config {
  const host = optional("HOST") ?? "127.0.0.1";
  const config: Config = {
    port: Number(optional("PORT") ?? 8080),
    host,
    dataDir: resolve(optional("DATA_DIR") ?? "./data"),
    logLevel: optional("LOG_LEVEL") ?? "info",
    controlToken: optional("CONTROL_TOKEN"),
    overlayToken: optional("OVERLAY_TOKEN"),
    publicUrl: optional("PUBLIC_URL"),
    staticDir: resolve(optional("STATIC_DIR") ?? new URL("../../frontend", import.meta.url).pathname),
  };

  const exposed = !["127.0.0.1", "localhost", "::1"].includes(host);
  if (exposed && !config.controlToken) {
    throw new Error(`HOST=${host} exposes the server on the network; set CONTROL_TOKEN (and OVERLAY_TOKEN)`);
  }
  if (config.controlToken && !config.overlayToken) {
    throw new Error("CONTROL_TOKEN is set; also set OVERLAY_TOKEN so the overlay URL never contains the control token");
  }
  return config;
}
