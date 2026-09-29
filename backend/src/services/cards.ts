import { inArray } from "drizzle-orm";
import type { Card, DeckEntry, ResolvedCard } from "@cso/shared";
import type { Db } from "../db/client.ts";
import { cards } from "../db/schema.ts";
import type { PluginRegistry } from "./plugins.ts";

export function rowToCard(row: typeof cards.$inferSelect): Card {
  return { key: row.cardKey, name: row.name, layout: row.layout, faces: row.faces, meta: row.meta ?? undefined };
}

export class CardService {
  private readonly db: Db;
  private readonly plugins: PluginRegistry;

  constructor(db: Db, plugins: PluginRegistry) {
    this.db = db;
    this.plugins = plugins;
  }

  async upsert(gameId: string, list: Card[]): Promise<void> {
    const unique = new Map(list.map((card) => [card.key, card]));
    for (const card of unique.values()) {
      const values = {
        cardKey: card.key,
        game: gameId,
        name: card.name,
        layout: card.layout,
        faces: card.faces,
        meta: card.meta ?? null,
        fetchedAt: new Date(),
      };
      await this.db
        .insert(cards)
        .values(values)
        .onConflictDoUpdate({ target: cards.cardKey, set: { name: values.name, layout: values.layout, faces: values.faces, meta: values.meta, fetchedAt: values.fetchedAt } });
    }
  }

  async get(keys: string[]): Promise<Map<string, Card>> {
    if (keys.length === 0) return new Map();
    const rows = await this.db.select().from(cards).where(inArray(cards.cardKey, [...new Set(keys)]));
    return new Map(rows.map((row) => [row.cardKey, rowToCard(row)]));
  }

  async resolve(gameId: string, entries: DeckEntry[]): Promise<ResolvedCard[]> {
    const { plugin } = this.plugins.game(gameId);
    const resolved = await plugin.resolveCards(entries);
    const all: Card[] = [];
    for (const item of resolved) {
      if (item.card) all.push(item.card);
      if (item.related) all.push(...item.related);
    }
    await this.upsert(gameId, all);
    return resolved;
  }

  async search(gameId: string, query: string): Promise<Card[]> {
    const { plugin } = this.plugins.game(gameId);
    if (!plugin.searchCards) return [];
    const found = await plugin.searchCards(query);
    await this.upsert(gameId, found);
    return found;
  }

  async related(gameId: string, card: Card): Promise<Card[]> {
    const { plugin } = this.plugins.game(gameId);
    if (!plugin.relatedCards) return [];
    const found = await plugin.relatedCards(card);
    await this.upsert(gameId, found);
    return found;
  }
}
