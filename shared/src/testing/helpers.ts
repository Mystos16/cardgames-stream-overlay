import type { ConnectorContext, GamePluginContext, HttpRequestInit, Logger, PluginHttp } from "../types.ts";
import type { SettingsValues } from "../settings.ts";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function fetchHttp(userAgent = "cardgames-stream-overlay-tests/0.1"): PluginHttp {
  return {
    async json<T>(url: string, init: HttpRequestInit = {}): Promise<T> {
      const response = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return (await response.json()) as T;
    },
  };
}

export function createTestGameContext(overrides: Partial<GamePluginContext> = {}): GamePluginContext {
  return {
    http: fetchHttp(),
    settings: () => ({}),
    env: (name) => process.env[name],
    logger: silentLogger,
    ...overrides,
  };
}

export function createTestConnectorContext(settings: SettingsValues = {}): ConnectorContext {
  return {
    publicBaseUrl: () => "http://localhost:8080",
    overlayUrl: () => "http://localhost:8080/overlay/",
    settings: () => settings,
    env: (name) => process.env[name],
    logger: silentLogger,
  };
}
