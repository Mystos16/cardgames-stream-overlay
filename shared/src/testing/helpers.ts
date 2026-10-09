import type { ConnectorContext, GamePluginContext, HttpRequestInit, Logger, PluginHttp } from "../types.ts";
import type { SettingsValues } from "../settings.ts";

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function fetchHttp(userAgent = "cardgames-stream-overlay-tests/0.1"): PluginHttp {
  const send = async (url: string, init: HttpRequestInit, accept: string) => {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "User-Agent": userAgent,
        Accept: accept,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response;
  };
  return {
    async json<T>(url: string, init: HttpRequestInit = {}): Promise<T> {
      return (await (await send(url, init, "application/json")).json()) as T;
    },
    async text(url: string, init: HttpRequestInit = {}): Promise<string> {
      return (await send(url, init, "text/html,text/plain")).text();
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
