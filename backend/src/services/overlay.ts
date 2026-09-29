import { randomUUID } from "node:crypto";
import { splitCardKey, type Card, type OverlayMessage, type OverlayShowMessage } from "@cso/shared";
import type { FastifyBaseLogger } from "fastify";
import type { EventHub } from "./events.ts";
import type { ImageCache } from "./images.ts";
import type { PluginRegistry } from "./plugins.ts";
import type { SettingsService } from "./settings.ts";

export class OverlayService {
  private readonly images: ImageCache;
  private readonly events: EventHub;
  private readonly plugins: PluginRegistry;
  private readonly settings: SettingsService;
  private readonly log: FastifyBaseLogger;
  private current: OverlayShowMessage | null = null;
  private hideTimer: NodeJS.Timeout | undefined;

  constructor(images: ImageCache, events: EventHub, plugins: PluginRegistry, settings: SettingsService, log: FastifyBaseLogger) {
    this.images = images;
    this.events = events;
    this.plugins = plugins;
    this.settings = settings;
    this.log = log;
  }

  state(): OverlayMessage | null {
    return this.current;
  }

  async show(card: Card, face = 0, playerName?: string): Promise<OverlayShowMessage> {
    const paths = await this.images.ensureAll(card);
    const images = paths.map((path) => this.images.publicUrl(path));
    const message: OverlayShowMessage = {
      type: "show",
      id: randomUUID(),
      card: { key: card.key, name: card.name, layout: card.layout },
      face: Math.min(face, images.length - 1),
      images,
      playerName,
    };
    this.current = message;
    this.broadcast(message);

    const gameId = splitCardKey(card.key).gameId;
    for (const connector of this.plugins.connectors.values()) {
      connector
        .onShow?.({ card, face: message.face, imageUrls: images, playerName, gameId })
        .catch((error) => this.log.warn({ connector: connector.id, err: String(error) }, "connector onShow failed"));
    }

    clearTimeout(this.hideTimer);
    const seconds = Number(this.settings.get("core").overlayDurationSec ?? 0);
    if (seconds > 0) this.hideTimer = setTimeout(() => void this.hide(), seconds * 1000);
    return message;
  }

  flip(): OverlayMessage | null {
    if (!this.current || this.current.images.length < 2) return this.current;
    this.current = { ...this.current, face: (this.current.face + 1) % this.current.images.length };
    this.broadcast({ type: "flip", face: this.current.face });
    return this.current;
  }

  async hide(): Promise<void> {
    clearTimeout(this.hideTimer);
    this.current = null;
    this.broadcast({ type: "hide" });
    for (const connector of this.plugins.connectors.values()) {
      connector.onHide?.().catch((error) => this.log.warn({ connector: connector.id, err: String(error) }, "connector onHide failed"));
    }
  }

  private broadcast(message: OverlayMessage): void {
    this.events.overlay.publish(message);
    this.events.control.publish({ type: "overlay", message: this.current });
  }
}
