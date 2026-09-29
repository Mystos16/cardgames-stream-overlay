import { cardKey, type Card, type DeckEntry, type GamePluginContext, type ResolvedCard } from "@cso/shared";

const API = "https://api.scryfall.com";
const BATCH = 75;
const RELATED_COMPONENTS = new Set(["token", "meld_result", "meld_part"]);

interface ImageUris {
  png?: string;
  large?: string;
  normal?: string;
}

interface ScryfallCard {
  id: string;
  name: string;
  layout: string;
  set: string;
  collector_number: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  image_uris?: ImageUris;
  card_faces?: { name: string; type_line?: string; image_uris?: ImageUris }[];
  all_parts?: { id: string; component: string; name: string; type_line?: string }[];
}

interface CollectionResponse {
  data: ScryfallCard[];
  not_found: Record<string, string>[];
}

interface ListResponse {
  data: ScryfallCard[];
}

type Identifier = { id: string } | { set: string; collector_number: string } | { name: string; set?: string };

function normalize(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}/ ]/gu, "").replace(/\s+/g, " ").trim();
}

export class ScryfallClient {
  private readonly ctx: GamePluginContext;

  constructor(ctx: GamePluginContext) {
    this.ctx = ctx;
  }

  private format(): "png" | "large" {
    return this.ctx.settings().imageFormat === "large" ? "large" : "png";
  }

  toCard(raw: ScryfallCard): Card {
    const format = this.format();
    const pick = (uris?: ImageUris) => uris?.[format] ?? uris?.png ?? uris?.large ?? uris?.normal;
    const faceImages = raw.card_faces?.every((face) => face.image_uris) ?? false;
    const faces =
      faceImages && raw.card_faces
        ? raw.card_faces.map((face) => ({ name: face.name, imageUrl: pick(face.image_uris)! }))
        : [{ name: raw.name, imageUrl: pick(raw.image_uris) ?? pick(raw.card_faces?.[0]?.image_uris) ?? "" }];

    return {
      key: cardKey("mtg", raw.id),
      name: raw.name,
      layout: faces.length > 1 ? "double_faced" : raw.layout,
      faces: faces.filter((face) => face.imageUrl),
      meta: {
        scryfallId: raw.id,
        scryfallLayout: raw.layout,
        set: raw.set,
        collectorNumber: raw.collector_number,
        typeLine: raw.type_line ?? raw.card_faces?.map((face) => face.type_line).join(" // "),
        manaCost: raw.mana_cost,
        cmc: raw.cmc,
        colors: raw.colors,
        colorIdentity: raw.color_identity,
        relatedIds: (raw.all_parts ?? [])
          .filter((part) => RELATED_COMPONENTS.has(part.component) && part.id !== raw.id)
          .map((part) => part.id),
      },
    };
  }

  private identifierFor(entry: DeckEntry): Identifier {
    if (entry.identifiers.scryfallId) return { id: entry.identifiers.scryfallId };
    if (entry.identifiers.set && entry.identifiers.number) {
      return { set: entry.identifiers.set, collector_number: entry.identifiers.number };
    }
    const name = entry.name.split(" // ")[0]!;
    return entry.identifiers.set ? { name, set: entry.identifiers.set } : { name };
  }

  private matches(entry: DeckEntry, identifier: Identifier, raw: ScryfallCard): boolean {
    if ("id" in identifier) return raw.id === identifier.id;
    if ("collector_number" in identifier) {
      return raw.set === identifier.set && raw.collector_number === identifier.collector_number;
    }
    const wanted = normalize(identifier.name);
    const names = [raw.name, ...(raw.card_faces?.map((face) => face.name) ?? [])].map(normalize);
    return names.includes(wanted) || normalize(raw.name) === normalize(entry.name);
  }

  async resolve(entries: DeckEntry[]): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = [];
    for (let offset = 0; offset < entries.length; offset += BATCH) {
      const chunk = entries.slice(offset, offset + BATCH);
      const identifiers = chunk.map((entry) => this.identifierFor(entry));
      const response = await this.ctx.http.json<CollectionResponse>(`${API}/cards/collection`, {
        method: "POST",
        body: { identifiers },
      });
      const pool = [...response.data];
      chunk.forEach((entry, index) => {
        const identifier = identifiers[index]!;
        const found = pool.findIndex((raw) => this.matches(entry, identifier, raw));
        if (found === -1) {
          results.push({ entry, card: null, error: "card not found on Scryfall" });
          return;
        }
        results.push({ entry, card: this.toCard(pool[found]!) });
      });
    }

    if (this.ctx.settings().autoTokens !== false) {
      const relatedIds = new Set<string>();
      for (const result of results) {
        for (const id of (result.card?.meta?.relatedIds as string[] | undefined) ?? []) relatedIds.add(id);
      }
      const relatedCards = await this.fetchByIds([...relatedIds]);
      const byId = new Map(relatedCards.map((card) => [card.meta!.scryfallId as string, card]));
      for (const result of results) {
        const ids = (result.card?.meta?.relatedIds as string[] | undefined) ?? [];
        const related = ids.map((id) => byId.get(id)).filter((card): card is Card => Boolean(card));
        if (related.length) result.related = related;
      }
    }
    return results;
  }

  private async fetchByIds(ids: string[]): Promise<Card[]> {
    const cards: Card[] = [];
    for (let offset = 0; offset < ids.length; offset += BATCH) {
      const chunk = ids.slice(offset, offset + BATCH);
      const response = await this.ctx.http.json<CollectionResponse>(`${API}/cards/collection`, {
        method: "POST",
        body: { identifiers: chunk.map((id) => ({ id })) },
      });
      cards.push(...response.data.map((raw) => this.toCard(raw)));
    }
    return cards;
  }

  async related(card: Card): Promise<Card[]> {
    const ids = (card.meta?.relatedIds as string[] | undefined) ?? [];
    return this.fetchByIds(ids);
  }

  async search(query: string): Promise<Card[]> {
    const url = `${API}/cards/search?unique=cards&order=name&include_extras=true&q=${encodeURIComponent(query)}`;
    try {
      const response = await this.ctx.http.json<ListResponse>(url);
      return response.data.slice(0, 30).map((raw) => this.toCard(raw));
    } catch (error) {
      if (String(error).includes("404")) return [];
      throw error;
    }
  }
}
