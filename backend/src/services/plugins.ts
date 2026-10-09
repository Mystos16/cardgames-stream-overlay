import {
  PLUGIN_API_VERSION,
  type Connector,
  type ConnectorFactory,
  type GamePlugin,
  type GamePluginFactory,
  type Logger,
} from "@cso/shared";
import type { FastifyBaseLogger } from "fastify";
import { connectorFactories, gameFactories } from "../generated/registry.ts";
import { RateLimiter, createPluginHttp } from "./http.ts";
import type { SettingsService } from "./settings.ts";

export interface LoadedGame {
  plugin: GamePlugin;
  limiter: RateLimiter;
}

export function pluginLogger(log: FastifyBaseLogger, plugin: string): Logger {
  const child = log.child({ plugin });
  return {
    debug: (msg, data) => child.debug(data ?? {}, msg),
    info: (msg, data) => child.info(data ?? {}, msg),
    warn: (msg, data) => child.warn(data ?? {}, msg),
    error: (msg, data) => child.error(data ?? {}, msg),
  };
}

export class PluginRegistry {
  readonly games = new Map<string, LoadedGame>();
  readonly connectors = new Map<string, Connector>();

  constructor(log: FastifyBaseLogger, settingsService: SettingsService) {
    for (const factory of gameFactories as GamePluginFactory[]) {
      if (factory.apiVersion !== PLUGIN_API_VERSION) {
        log.error({ plugin: factory.id, apiVersion: factory.apiVersion }, "skipping game plugin with unsupported apiVersion");
        continue;
      }
      const scope = `game:${factory.id}`;
      let limiter = new RateLimiter(1);
      const plugin = factory.create({
        http: {
          json: (url, init) => createPluginHttp(limiter, plugin.userAgent).json(url, init),
          text: (url, init) => createPluginHttp(limiter, plugin.userAgent).text(url, init),
        },
        settings: () => settingsService.get(scope),
        env: (name) => process.env[name],
        logger: pluginLogger(log, factory.id),
      });
      if (plugin.apiVersion !== PLUGIN_API_VERSION || plugin.id !== factory.id) {
        log.error({ plugin: factory.id }, "skipping game plugin with mismatching id or apiVersion");
        continue;
      }
      limiter = new RateLimiter(plugin.rateLimit.requestsPerSecond);
      settingsService.register(scope, plugin.settingsSchema);
      this.games.set(plugin.id, { plugin, limiter });
    }

    for (const factory of connectorFactories as ConnectorFactory[]) {
      if (factory.apiVersion !== PLUGIN_API_VERSION) {
        log.error({ plugin: factory.id }, "skipping connector with unsupported apiVersion");
        continue;
      }
      const connector = factory.create();
      if (connector.apiVersion !== PLUGIN_API_VERSION || connector.id !== factory.id) {
        log.error({ plugin: factory.id }, "skipping connector with mismatching id or apiVersion");
        continue;
      }
      settingsService.register(`connector:${connector.id}`, connector.settingsSchema);
      this.connectors.set(connector.id, connector);
    }
  }

  game(id: string): LoadedGame {
    const game = this.games.get(id);
    if (!game) throw Object.assign(new Error(`unknown game ${id}`), { statusCode: 404 });
    return game;
  }
}
