import { cardKey, type Card, type DeckEntry, type GamePluginContext, type ResolvedCard } from "@cso/shared";

const API = "https://api.tcgdex.net/v2";

const SET_ALIASES: Record<string, string> = {
  PR: "svp",
  "PR-SV": "svp",
  SVP: "svp",
  SVE: "sve",
};

interface TcgdexBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface TcgdexCard extends TcgdexBrief {
  category?: string;
  rarity?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  set?: { id: string; name: string };
}

export class TcgdexClient {
  private readonly setIds = new Map<string, string | null>();

  private readonly ctx: GamePluginContext;

  constructor(ctx: GamePluginContext) {
    this.ctx = ctx;
  }

  private lang(): string {
    return String(this.ctx.settings().language ?? "en");
  }

  private ext(): string {
    return this.ctx.settings().imageFormat === "webp" ? "webp" : "png";
  }

  toCard(raw: TcgdexCard): Card | null {
    if (!raw.image) return null;
    return {
      key: cardKey("pokemon", `${this.lang()}-${raw.id}`),
      name: raw.name,
      layout: "normal",
      faces: [{ name: raw.name, imageUrl: `${raw.image}/high.${this.ext()}` }],
      meta: {
        tcgdexId: raw.id,
        category: raw.category,
        rarity: raw.rarity,
        hp: raw.hp,
        types: raw.types,
        stage: raw.stage,
        set: raw.set?.id,
        setName: raw.set?.name,
        localId: raw.localId,
      },
    };
  }

  private async setId(code: string): Promise<string | null> {
    const upper = code.toUpperCase();
    if (SET_ALIASES[upper]) return SET_ALIASES[upper];
    if (this.setIds.has(upper)) return this.setIds.get(upper)!;
    const sets = await this.ctx.http.json<{ id: string }[]>(
      `${API}/${this.lang()}/sets?abbreviation.official=eq:${encodeURIComponent(upper)}`,
    );
    let id = sets[0]?.id ?? null;
    if (!id) {
      try {
        const direct = await this.ctx.http.json<{ id: string }>(`${API}/${this.lang()}/sets/${encodeURIComponent(code.toLowerCase())}`);
        id = direct.id;
      } catch {
        id = null;
      }
    }
    this.setIds.set(upper, id);
    return id;
  }

  private async bySetNumber(set: string, number: string): Promise<TcgdexCard | null> {
    const id = await this.setId(set);
    if (!id) return null;
    const candidates = [number, number.padStart(3, "0")];
    for (const localId of new Set(candidates)) {
      try {
        return await this.ctx.http.json<TcgdexCard>(`${API}/${this.lang()}/sets/${id}/${encodeURIComponent(localId)}`);
      } catch {
        continue;
      }
    }
    return null;
  }

  private async byName(name: string): Promise<TcgdexCard | null> {
    const cleaned = name.replace(/^basic\s+/i, "Basic ").replace(/\{([A-Z])\}\s+energy/i, (_, letter: string) => {
      const map: Record<string, string> = { G: "Grass", R: "Fire", W: "Water", L: "Lightning", P: "Psychic", F: "Fighting", D: "Darkness", M: "Metal", Y: "Fairy" };
      return `Basic ${map[letter.toUpperCase()] ?? letter} Energy`;
    }).replace(/^(grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy)\s+energy$/i, (_, type: string) => `Basic ${type[0]!.toUpperCase()}${type.slice(1).toLowerCase()} Energy`);
    const list = await this.ctx.http.json<TcgdexBrief[]>(
      `${API}/${this.lang()}/cards?name=eq:${encodeURIComponent(cleaned)}&sort:field=id&sort:order=DESC`,
    );
    const withImage = list.find((card) => card.image);
    if (!withImage) return null;
    return this.ctx.http.json<TcgdexCard>(`${API}/${this.lang()}/cards/${encodeURIComponent(withImage.id)}`);
  }

  async resolve(entries: DeckEntry[]): Promise<ResolvedCard[]> {
    const results: ResolvedCard[] = [];
    for (const entry of entries) {
      try {
        let raw: TcgdexCard | null = null;
        if (entry.identifiers.tcgdexId) {
          raw = await this.ctx.http.json<TcgdexCard>(`${API}/${this.lang()}/cards/${encodeURIComponent(entry.identifiers.tcgdexId)}`);
        } else if (entry.identifiers.set && entry.identifiers.number) {
          raw = await this.bySetNumber(entry.identifiers.set, entry.identifiers.number);
        }
        if (!raw?.image) raw = (await this.byName(entry.name)) ?? raw;
        const card = raw ? this.toCard(raw) : null;
        results.push(card ? { entry, card } : { entry, card: null, error: "card not found on TCGdex" });
      } catch (error) {
        results.push({ entry, card: null, error: String(error) });
      }
    }
    return results;
  }

  async search(query: string): Promise<Card[]> {
    const list = await this.ctx.http.json<TcgdexBrief[]>(
      `${API}/${this.lang()}/cards?name=like:${encodeURIComponent(query)}&pagination:itemsPerPage=30`,
    );
    return list.map((raw) => this.toCard(raw)).filter((card): card is Card => Boolean(card));
  }
}
