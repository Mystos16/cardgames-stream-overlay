import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Card, DeckEntry, ParseWarning } from "@cso/shared";
import type { Db } from "../db/client.ts";
import { cardImages, deckEntries, decks } from "../db/schema.ts";
import type { CardService } from "./cards.ts";
import type { PluginRegistry } from "./plugins.ts";
import type { PreloadQueue } from "./preload.ts";
import type { SettingsService } from "./settings.ts";

export interface DeckCardView {
  entryId: number;
  section: string;
  quantity: number;
  name: string;
  auto: boolean;
  error: string | null;
  card: (Card & { cached: boolean[] }) | null;
}

export interface DeckView {
  id: number;
  game: string;
  name: string;
  rawText: string;
  entries: DeckCardView[];
}

function notFound(what: string): Error {
  return Object.assign(new Error(`${what} not found`), { statusCode: 404 });
}

export class DeckService {
  private readonly db: Db;
  private readonly plugins: PluginRegistry;
  private readonly cardService: CardService;
  private readonly preload: PreloadQueue;
  private readonly settings: SettingsService;

  constructor(db: Db, plugins: PluginRegistry, cardService: CardService, preload: PreloadQueue, settings: SettingsService) {
    this.db = db;
    this.plugins = plugins;
    this.cardService = cardService;
    this.preload = preload;
    this.settings = settings;
  }

  async list(game?: string) {
    const query = this.db
      .select({ id: decks.id, game: decks.game, name: decks.name, updatedAt: decks.updatedAt })
      .from(decks)
      .orderBy(desc(decks.updatedAt));
    return game ? query.where(eq(decks.game, game)) : query;
  }

  async create(game: string, name: string, rawText: string): Promise<{ deck: DeckView; warnings: ParseWarning[] }> {
    this.plugins.game(game);
    const inserted = await this.db.insert(decks).values({ game, name, rawText }).returning({ id: decks.id });
    return this.replaceEntries(inserted[0]!.id, game, rawText);
  }

  async update(id: number, name: string | undefined, rawText: string | undefined): Promise<{ deck: DeckView; warnings: ParseWarning[] }> {
    const current = (await this.db.select().from(decks).where(eq(decks.id, id)))[0];
    if (!current) throw notFound("deck");
    await this.db
      .update(decks)
      .set({ name: name ?? current.name, rawText: rawText ?? current.rawText, updatedAt: new Date() })
      .where(eq(decks.id, id));
    if (rawText === undefined || rawText === current.rawText) return { deck: await this.get(id), warnings: [] };
    return this.replaceEntries(id, current.game, rawText);
  }

  async remove(id: number): Promise<void> {
    this.preload.cancel(id);
    await this.db.delete(decks).where(eq(decks.id, id));
  }

  private async replaceEntries(deckId: number, game: string, rawText: string): Promise<{ deck: DeckView; warnings: ParseWarning[] }> {
    const { plugin } = this.plugins.game(game);
    const parsed = plugin.parseDecklist(rawText);
    await this.db.delete(deckEntries).where(eq(deckEntries.deckId, deckId));
    if (parsed.entries.length) {
      await this.db.insert(deckEntries).values(
        parsed.entries.map((entry) => ({
          deckId,
          section: entry.section,
          quantity: entry.quantity,
          name: entry.name,
          identifiers: entry.identifiers,
          cardKey: null,
          error: null,
          auto: false,
        })),
      );
    }
    const warnings = [...parsed.warnings];
    try {
      await this.resolve(deckId);
    } catch (error) {
      warnings.push({ line: 0, text: "", message: `could not resolve cards now, retry later: ${String(error)}` });
    }
    return { deck: await this.get(deckId), warnings };
  }

  async resolve(deckId: number): Promise<DeckView> {
    const deck = (await this.db.select().from(decks).where(eq(decks.id, deckId)))[0];
    if (!deck) throw notFound("deck");
    const rows = await this.db.select().from(deckEntries).where(eq(deckEntries.deckId, deckId));
    const manual = rows.filter((row) => !row.auto);
    const entries: DeckEntry[] = manual.map((row) => ({
      quantity: row.quantity,
      name: row.name,
      section: row.section,
      identifiers: row.identifiers,
    }));
    const resolved = await this.cardService.resolve(deck.game, entries);

    for (const [index, item] of resolved.entries()) {
      await this.db
        .update(deckEntries)
        .set({ cardKey: item.card?.key ?? null, error: item.card ? null : (item.error ?? "not found") })
        .where(eq(deckEntries.id, manual[index]!.id));
    }

    await this.db.delete(deckEntries).where(inArray(deckEntries.id, rows.filter((row) => row.auto).map((row) => row.id)));
    const present = new Set(resolved.map((item) => item.card?.key).filter(Boolean));
    const tokens = new Map<string, Card>();
    for (const item of resolved) for (const card of item.related ?? []) if (!present.has(card.key)) tokens.set(card.key, card);
    if (tokens.size) {
      await this.db.insert(deckEntries).values(
        [...tokens.values()].map((card) => ({
          deckId,
          section: "tokens",
          quantity: 1,
          name: card.name,
          identifiers: {},
          cardKey: card.key,
          error: null,
          auto: true,
        })),
      );
    }

    const view = await this.get(deckId);
    if (this.settings.get("core").fetchMode !== "onDemand") this.startPreload(view);
    return view;
  }

  async addCard(deckId: number, card: Card, section: string): Promise<DeckView> {
    await this.db.insert(deckEntries).values({
      deckId,
      section,
      quantity: 1,
      name: card.name,
      identifiers: {},
      cardKey: card.key,
      error: null,
      auto: false,
    });
    return this.get(deckId);
  }

  startPreload(view: DeckView) {
    const cards = view.entries.map((entry) => entry.card).filter((card): card is NonNullable<typeof card> => Boolean(card));
    return this.preload.start(view.id, cards);
  }

  async get(deckId: number): Promise<DeckView> {
    const deck = (await this.db.select().from(decks).where(eq(decks.id, deckId)))[0];
    if (!deck) throw notFound("deck");
    const rows = await this.db.select().from(deckEntries).where(eq(deckEntries.deckId, deckId)).orderBy(asc(deckEntries.id));
    const keys = rows.map((row) => row.cardKey).filter((key): key is string => Boolean(key));
    const cardMap = await this.cardService.get(keys);
    const imageRows = keys.length
      ? await this.db.select().from(cardImages).where(inArray(cardImages.cardKey, [...new Set(keys)]))
      : [];
    const ready = new Set(imageRows.filter((row) => row.status === "ready").map((row) => `${row.cardKey}#${row.faceIndex}`));

    return {
      id: deck.id,
      game: deck.game,
      name: deck.name,
      rawText: deck.rawText,
      entries: rows.map((row) => {
        const card = row.cardKey ? cardMap.get(row.cardKey) : undefined;
        return {
          entryId: row.id,
          section: row.section,
          quantity: row.quantity,
          name: row.name,
          auto: row.auto,
          error: row.error,
          card: card ? { ...card, cached: card.faces.map((_, index) => ready.has(`${card.key}#${index}`)) } : null,
        };
      }),
    };
  }
}
