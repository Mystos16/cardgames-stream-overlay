import { resolve } from "node:path";

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  logLevel: string;
  publicUrl?: string;
  staticDir: string;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function loadConfig(): Config {
  return {
    port: Number(optional("PORT") ?? 8080),
    host: optional("HOST") ?? "127.0.0.1",
    dataDir: resolve(optional("DATA_DIR") ?? "./data"),
    logLevel: optional("LOG_LEVEL") ?? "info",
    publicUrl: optional("PUBLIC_URL"),
    staticDir: resolve(optional("STATIC_DIR") ?? new URL("../../frontend", import.meta.url).pathname),
  };
}
