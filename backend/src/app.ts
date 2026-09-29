import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { requireRole } from "./auth.ts";
import type { Config } from "./config.ts";
import { openDatabase } from "./db/client.ts";
import { apiRoutes } from "./routes/api.ts";
import { wsRoutes } from "./routes/ws.ts";
import { CardService } from "./services/cards.ts";
import { DeckService } from "./services/decks.ts";
import { EventHub } from "./services/events.ts";
import { ImageCache } from "./services/images.ts";
import { MatchService } from "./services/matches.ts";
import { OverlayService } from "./services/overlay.ts";
import { PluginRegistry, pluginLogger } from "./services/plugins.ts";
import { PreloadQueue } from "./services/preload.ts";
import { CORE_SETTINGS, SettingsService } from "./services/settings.ts";

export interface App {
  config: Config;
  plugins: PluginRegistry;
  settings: SettingsService;
  events: EventHub;
  cards: CardService;
  images: ImageCache;
  preload: PreloadQueue;
  decks: DeckService;
  matches: MatchService;
  overlay: OverlayService;
}

export async function buildServer(config: Config): Promise<{ server: FastifyInstance; app: App }> {
  const server = Fastify({ logger: { level: config.logLevel }, trustProxy: true });
  const { db, sqlite } = await openDatabase(config.dataDir);
  server.addHook("onClose", async () => sqlite.close());

  const settings = new SettingsService(db);
  settings.register("core", CORE_SETTINGS);
  const plugins = new PluginRegistry(server.log, settings);
  await settings.load();

  const events = new EventHub();
  const cards = new CardService(db, plugins);
  const images = new ImageCache(db, plugins, events, config.dataDir);
  const preload = new PreloadQueue(images, events, server.log);
  const decks = new DeckService(db, plugins, cards, preload, settings);
  const matches = new MatchService(db, plugins, decks);
  const overlay = new OverlayService(images, events, plugins, settings, server.log);
  const app: App = { config, plugins, settings, events, cards, images, preload, decks, matches, overlay };

  await server.register(fastifyWebsocket);

  server.get("/healthz", async () => ({ status: "ok" }));

  await server.register(async (scope) => {
    scope.addHook("onRequest", requireRole(config, ["control"]));
    await apiRoutes(scope, app);
  });

  await server.register(async (scope) => {
    scope.addHook("onRequest", requireRole(config, ["control", "overlay"]));
    await scope.register(fastifyStatic, {
      root: images.root,
      prefix: "/images/",
      decorateReply: false,
      maxAge: "365d",
      immutable: true,
    });
  });

  await wsRoutes(server, app);

  for (const name of ["control", "overlay"]) {
    const dir = join(config.staticDir, name, "dist");
    if (!existsSync(dir)) {
      server.log.warn({ dir }, `${name} frontend not built; run 'pnpm build' or use the Vite dev server`);
      continue;
    }
    await server.register(fastifyStatic, { root: dir, prefix: `/${name}/`, decorateReply: false });
  }
  server.get("/", async (_request, reply) => reply.redirect("/control/"));

  const publicBase = () => config.publicUrl ?? `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
  for (const connector of plugins.connectors.values()) {
    await connector.start({
      publicBaseUrl: publicBase,
      overlayUrl: () => {
        const token = config.overlayToken ? `?token=${encodeURIComponent(config.overlayToken)}` : "";
        return `${publicBase()}/overlay/${token}`;
      },
      settings: () => settings.get(`connector:${connector.id}`),
      env: (name) => process.env[name],
      logger: pluginLogger(server.log, connector.id),
    });
  }
  server.addHook("onClose", async () => {
    for (const connector of plugins.connectors.values()) await connector.stop?.();
  });

  return { server, app };
}
