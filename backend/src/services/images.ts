import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { splitCardKey, type Card } from "@cso/shared";
import type { Db } from "../db/client.ts";
import { cardImages } from "../db/schema.ts";
import { downloadBinary } from "./http.ts";
import type { EventHub } from "./events.ts";
import type { PluginRegistry } from "./plugins.ts";

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/avif": "avif",
};

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class ImageCache {
  private readonly db: Db;
  private readonly plugins: PluginRegistry;
  private readonly events: EventHub;
  readonly root: string;
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(db: Db, plugins: PluginRegistry, events: EventHub, dataDir: string) {
    this.db = db;
    this.plugins = plugins;
    this.events = events;
    this.root = join(dataDir, "images");
  }

  async cachedPath(cardKey: string, faceIndex: number): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(cardImages)
      .where(and(eq(cardImages.cardKey, cardKey), eq(cardImages.faceIndex, faceIndex)));
    const row = rows[0];
    return row?.status === "ready" && row.path ? row.path : null;
  }

  publicUrl(path: string): string {
    return `/images/${path}`;
  }

  ensure(card: Card, faceIndex: number): Promise<string> {
    const id = `${card.key}#${faceIndex}`;
    const running = this.inflight.get(id);
    if (running) return running;
    const task = this.download(card, faceIndex).finally(() => this.inflight.delete(id));
    this.inflight.set(id, task);
    return task;
  }

  async ensureAll(card: Card): Promise<string[]> {
    return Promise.all(card.faces.map((_, index) => this.ensure(card, index)));
  }

  private async download(card: Card, faceIndex: number): Promise<string> {
    const existing = await this.cachedPath(card.key, faceIndex);
    if (existing) return existing;

    const face = card.faces[faceIndex];
    if (!face) throw new Error(`card ${card.key} has no face ${faceIndex}`);
    const { gameId, id } = splitCardKey(card.key);
    const { limiter, plugin } = this.plugins.game(gameId);

    try {
      const { data, contentType } = await downloadBinary(limiter, face.imageUrl, plugin.userAgent);
      const ext = EXTENSIONS[contentType.split(";")[0]!.trim()] ?? face.imageUrl.split("?")[0]!.split(".").pop() ?? "img";
      const relative = `${safeSegment(gameId)}/${safeSegment(id)}-${faceIndex}.${safeSegment(ext)}`;
      await mkdir(join(this.root, safeSegment(gameId)), { recursive: true });
      await writeFile(join(this.root, relative), data);
      await this.record(card.key, faceIndex, { status: "ready", path: relative, bytes: data.length, error: null });
      this.events.control.publish({ type: "image", cardKey: card.key, faceIndex, status: "ready" });
      return relative;
    } catch (error) {
      await this.record(card.key, faceIndex, { status: "failed", path: null, bytes: null, error: String(error) });
      this.events.control.publish({ type: "image", cardKey: card.key, faceIndex, status: "failed" });
      throw error;
    }
  }

  private async record(
    cardKey: string,
    faceIndex: number,
    values: { status: "ready" | "failed"; path: string | null; bytes: number | null; error: string | null },
  ): Promise<void> {
    await this.db
      .insert(cardImages)
      .values({ cardKey, faceIndex, ...values })
      .onConflictDoUpdate({ target: [cardImages.cardKey, cardImages.faceIndex], set: values });
  }

  async size(): Promise<{ bytes: number; files: number }> {
    let bytes = 0;
    let files = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          bytes += (await stat(full)).size;
          files++;
        }
      }
    };
    await walk(this.root);
    return { bytes, files };
  }

  async clear(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
    await this.db.delete(cardImages);
  }
}
