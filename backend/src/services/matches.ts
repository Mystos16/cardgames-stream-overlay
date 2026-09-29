import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { matchPlayers, matches } from "../db/schema.ts";
import type { DeckService } from "./decks.ts";
import type { PluginRegistry } from "./plugins.ts";

export interface PlayerInput {
  playerName: string;
  deckId: number | null;
}

export class MatchService {
  private readonly db: Db;
  private readonly plugins: PluginRegistry;
  private readonly decks: DeckService;

  constructor(db: Db, plugins: PluginRegistry, decks: DeckService) {
    this.db = db;
    this.plugins = plugins;
    this.decks = decks;
  }

  list() {
    return this.db.select().from(matches).orderBy(desc(matches.createdAt));
  }

  async get(id: number) {
    const match = (await this.db.select().from(matches).where(eq(matches.id, id)))[0];
    if (!match) throw Object.assign(new Error("match not found"), { statusCode: 404 });
    const players = await this.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, id)).orderBy(asc(matchPlayers.seat));
    return { ...match, players };
  }

  async create(game: string, name: string, players: PlayerInput[]) {
    this.plugins.game(game);
    const inserted = await this.db.insert(matches).values({ game, name }).returning({ id: matches.id });
    const id = inserted[0]!.id;
    await this.setPlayers(id, players);
    return this.get(id);
  }

  async update(id: number, name: string | undefined, players: PlayerInput[] | undefined) {
    await this.get(id);
    if (name !== undefined) await this.db.update(matches).set({ name }).where(eq(matches.id, id));
    if (players) await this.setPlayers(id, players);
    return this.get(id);
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(matches).where(eq(matches.id, id));
  }

  private async setPlayers(matchId: number, players: PlayerInput[]): Promise<void> {
    await this.db.delete(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    if (players.length === 0) return;
    await this.db.insert(matchPlayers).values(
      players.map((player, seat) => ({ matchId, seat, playerName: player.playerName, deckId: player.deckId })),
    );
  }

  async preload(id: number) {
    const match = await this.get(id);
    const progress = [];
    for (const player of match.players) {
      if (player.deckId === null) continue;
      progress.push(this.decks.startPreload(await this.decks.get(player.deckId)));
    }
    return progress;
  }
}
