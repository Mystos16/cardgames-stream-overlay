import { asc, desc, eq } from "drizzle-orm";
import {
  applyAction,
  buildBoard,
  normalizeState,
  sideCount,
  type Board,
  type FormatDef,
  type MatchAction,
  type MatchState,
  type Slot,
} from "@cso/shared";
import type { Db } from "../db/client.ts";
import { matchPlayers, matches } from "../db/schema.ts";
import type { DeckService } from "./decks.ts";
import type { EventHub } from "./events.ts";
import type { PluginRegistry } from "./plugins.ts";

export interface PlayerInput {
  playerName: string;
  deckId: number | null;
}

type MatchRow = typeof matches.$inferSelect;
type PlayerRow = typeof matchPlayers.$inferSelect;

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export class MatchService {
  private readonly db: Db;
  private readonly plugins: PluginRegistry;
  private readonly decks: DeckService;
  private readonly events: EventHub;
  private activeId: number | null = null;
  private board: Board | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(db: Db, plugins: PluginRegistry, decks: DeckService, events: EventHub) {
    this.db = db;
    this.plugins = plugins;
    this.decks = decks;
    this.events = events;
  }

  formatFor(game: string, formatId: string | null | undefined): FormatDef {
    const formats = this.plugins.game(game).plugin.formats;
    return formats.find((format) => format.id === formatId) ?? formats[0]!;
  }

  list() {
    return this.db
      .select({ id: matches.id, game: matches.game, name: matches.name, format: matches.format, createdAt: matches.createdAt })
      .from(matches)
      .orderBy(desc(matches.createdAt));
  }

  private async load(id: number): Promise<{ match: MatchRow; players: PlayerRow[] }> {
    const match = (await this.db.select().from(matches).where(eq(matches.id, id)))[0];
    if (!match) throw Object.assign(new Error("match not found"), { statusCode: 404 });
    const players = await this.db.select().from(matchPlayers).where(eq(matchPlayers.matchId, id)).orderBy(asc(matchPlayers.seat));
    return { match, players };
  }

  async get(id: number) {
    const { match, players } = await this.load(id);
    const format = this.formatFor(match.game, match.format);
    const state = normalizeState(format, sideCount(format, players.length), match.state);
    return {
      id: match.id,
      game: match.game,
      name: match.name,
      format: format.id,
      createdAt: match.createdAt,
      players,
      state,
      board: buildBoard(match, format, players, state),
    };
  }

  private validate(format: FormatDef, players: unknown[]): void {
    if (players.length < format.minPlayers || players.length > format.maxPlayers) {
      const range = format.minPlayers === format.maxPlayers ? `${format.minPlayers}` : `${format.minPlayers}-${format.maxPlayers}`;
      throw badRequest(`${format.name} needs ${range} players`);
    }
    if (format.teamSize && players.length % format.teamSize !== 0) {
      throw badRequest(`${format.name} needs teams of ${format.teamSize}`);
    }
  }

  async create(game: string, name: string, formatId: string | undefined, players: PlayerInput[]) {
    const format = this.formatFor(game, formatId);
    this.validate(format, players);
    const state = normalizeState(format, sideCount(format, players.length), null);
    const inserted = await this.db.insert(matches).values({ game, name, format: format.id, state }).returning({ id: matches.id });
    const id = inserted[0]!.id;
    await this.setPlayers(id, players);
    return this.get(id);
  }

  async update(id: number, input: { name?: string; format?: string; players?: PlayerInput[] }) {
    const { match, players } = await this.load(id);
    const formatChanged = input.format !== undefined && input.format !== match.format;
    const format = this.formatFor(match.game, input.format ?? match.format);
    const list = input.players ?? players;
    this.validate(format, list);
    const state = normalizeState(format, sideCount(format, list.length), formatChanged ? null : match.state);
    await this.db
      .update(matches)
      .set({ name: input.name ?? match.name, format: format.id, state })
      .where(eq(matches.id, id));
    if (input.players) await this.setPlayers(id, input.players);
    const result = await this.get(id);
    this.publish(id, result.board);
    return result;
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(matches).where(eq(matches.id, id));
    if (this.activeId === id) {
      this.activeId = null;
      this.board = null;
      this.events.overlay.publish({ type: "board", board: null });
      this.events.control.publish({ type: "board", board: null });
    }
  }

  private async setPlayers(matchId: number, players: PlayerInput[]): Promise<void> {
    await this.db.delete(matchPlayers).where(eq(matchPlayers.matchId, matchId));
    if (players.length === 0) return;
    await this.db.insert(matchPlayers).values(
      players.map((player, seat) => ({ matchId, seat, playerName: player.playerName, deckId: player.deckId })),
    );
  }

  act(id: number, action: MatchAction): Promise<{ state: MatchState; board: Board }> {
    const run = this.queue.then(async () => {
      const { match, players } = await this.load(id);
      const format = this.formatFor(match.game, match.format);
      const current = normalizeState(format, sideCount(format, players.length), match.state);
      let state: MatchState;
      try {
        state = applyAction(format, current, action);
      } catch (error) {
        throw badRequest(error instanceof Error ? error.message : String(error));
      }
      await this.db.update(matches).set({ state }).where(eq(matches.id, id));
      const board = buildBoard(match, format, players, state);
      this.publish(id, board);
      return { state, board };
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async activate(id: number): Promise<Board> {
    const { board } = await this.get(id);
    this.activeId = id;
    this.publish(id, board, true);
    return board;
  }

  activeBoard(): Board | null {
    return this.board;
  }

  slotForSeat(seat: number | undefined): Slot | undefined {
    if (seat === undefined || !this.board) return undefined;
    return this.board.sides.find((side) => side.seats.includes(seat))?.slot;
  }

  private publish(id: number, board: Board, force = false): void {
    if (!force && id !== this.activeId) return;
    this.board = board;
    this.events.overlay.publish({ type: "board", board });
    this.events.control.publish({ type: "board", board });
  }

  async preload(id: number) {
    const { players } = await this.load(id);
    const progress = [];
    for (const player of players) {
      if (player.deckId === null) continue;
      progress.push(this.decks.startPreload(await this.decks.get(player.deckId)));
    }
    return progress;
  }
}
