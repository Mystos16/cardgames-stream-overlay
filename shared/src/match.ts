export interface CounterDef {
  id: string;
  name: string;
  short: string;
  start: number;
  min?: number;
  max?: number;
  primary?: boolean;
  showWhen: "always" | "nonzero";
  ends?: { at: number; when: "lte" | "gte"; result: "lose" | "win" };
}

export interface OpponentCounterDef {
  id: string;
  name: string;
  short: string;
  showWhen: "always" | "nonzero";
  lethal?: number;
  alsoCounter?: string;
}

export interface FormatDef {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  defaultPlayers: number;
  teamSize?: number;
  counters: CounterDef[];
  opponentCounters?: OpponentCounterDef[];
  turns?: boolean;
}

export interface SideState {
  counters: Record<string, number>;
  opponentCounters: Record<string, Record<string, number>>;
  wins: number;
}

export interface MatchState {
  sides: SideState[];
  turn: number | null;
  gameNumber: number;
  bestOf: number;
  visible: boolean;
}

export type MatchAction =
  | { type: "counter"; side: number; counter: string; delta: number }
  | { type: "opponentCounter"; side: number; from: number; counter: string; delta: number }
  | { type: "win"; side: number; delta: number }
  | { type: "turn"; side: number | "next" | null }
  | { type: "newGame" }
  | { type: "resetMatch" }
  | { type: "bestOf"; value: number }
  | { type: "visible"; value: boolean };

export type Slot = "left" | "right" | "top-left" | "top" | "top-right" | "bottom-right" | "bottom" | "bottom-left";

export interface BoardCounter {
  id: string;
  name: string;
  short: string;
  value: number;
  primary: boolean;
  visible: boolean;
}

export interface BoardOpponentCounter {
  id: string;
  short: string;
  from: number;
  fromName: string;
  value: number;
  visible: boolean;
}

export interface BoardSide {
  index: number;
  name: string;
  seats: number[];
  slot: Slot;
  counters: BoardCounter[];
  opponentCounters: BoardOpponentCounter[];
  wins: number;
  status: "alive" | "out" | "won";
  active: boolean;
}

export interface Board {
  matchId: number;
  matchName: string;
  game: string;
  format: Pick<FormatDef, "id" | "name">;
  bestOf: number;
  gameNumber: number;
  visible: boolean;
  sides: BoardSide[];
}

export interface BoardPlayer {
  seat: number;
  playerName: string;
}

const SLOTS: Record<number, Slot[]> = {
  1: ["left"],
  2: ["left", "right"],
  3: ["top-left", "top-right", "bottom"],
  4: ["top-left", "top-right", "bottom-right", "bottom-left"],
  5: ["top-left", "top", "top-right", "bottom-right", "bottom-left"],
  6: ["top-left", "top", "top-right", "bottom-right", "bottom", "bottom-left"],
};

export const MAX_SIDES = 6;

export function layoutSlots(count: number): Slot[] {
  return SLOTS[Math.max(1, Math.min(MAX_SIDES, count))]!;
}

export function sideCount(format: FormatDef, players: number): number {
  return Math.max(1, Math.ceil(players / (format.teamSize ?? 1)));
}

function freshSide(format: FormatDef, wins = 0): SideState {
  return {
    counters: Object.fromEntries(format.counters.map((counter) => [counter.id, counter.start])),
    opponentCounters: Object.fromEntries((format.opponentCounters ?? []).map((counter) => [counter.id, {}])),
    wins,
  };
}

export function initialState(format: FormatDef, sides: number, bestOf = 1): MatchState {
  return {
    sides: Array.from({ length: sides }, () => freshSide(format)),
    turn: format.turns ? 0 : null,
    gameNumber: 1,
    bestOf,
    visible: true,
  };
}

export function normalizeState(format: FormatDef, sides: number, state: MatchState | null | undefined): MatchState {
  if (!state) return initialState(format, sides);
  const next: MatchState = structuredClone(state);
  next.sides = next.sides.slice(0, sides);
  while (next.sides.length < sides) next.sides.push(freshSide(format));
  next.sides = next.sides.map((side) => {
    const fresh = freshSide(format, side.wins);
    const opponentCounters: SideState["opponentCounters"] = {};
    for (const id of Object.keys(fresh.opponentCounters)) {
      const values = side.opponentCounters?.[id] ?? {};
      opponentCounters[id] = Object.fromEntries(Object.entries(values).filter(([from]) => Number(from) < sides));
    }
    return { counters: { ...fresh.counters, ...pick(side.counters, Object.keys(fresh.counters)) }, opponentCounters, wins: side.wins ?? 0 };
  });
  if (next.turn !== null && next.turn >= sides) next.turn = 0;
  if (format.turns && next.turn === null) next.turn = 0;
  if (!format.turns) next.turn = null;
  return next;
}

function pick(values: Record<string, number> | undefined, keys: string[]): Record<string, number> {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => keys.includes(key)));
}

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

function inRange(state: MatchState, side: number): boolean {
  return Number.isInteger(side) && side >= 0 && side < state.sides.length;
}

export function applyAction(format: FormatDef, state: MatchState, action: MatchAction): MatchState {
  const next: MatchState = structuredClone(state);
  switch (action.type) {
    case "counter": {
      const def = format.counters.find((counter) => counter.id === action.counter);
      if (!def || !inRange(next, action.side)) throw new Error("invalid counter action");
      const side = next.sides[action.side]!;
      side.counters[def.id] = clamp((side.counters[def.id] ?? def.start) + action.delta, def.min, def.max);
      return next;
    }
    case "opponentCounter": {
      const def = format.opponentCounters?.find((counter) => counter.id === action.counter);
      if (!def || !inRange(next, action.side) || !inRange(next, action.from) || action.side === action.from) {
        throw new Error("invalid opponent counter action");
      }
      const side = next.sides[action.side]!;
      const values = (side.opponentCounters[def.id] ??= {});
      const before = values[action.from] ?? 0;
      const after = Math.max(0, before + action.delta);
      values[action.from] = after;
      const linked = def.alsoCounter ? format.counters.find((counter) => counter.id === def.alsoCounter) : undefined;
      if (linked) {
        side.counters[linked.id] = clamp((side.counters[linked.id] ?? linked.start) - (after - before), linked.min, linked.max);
      }
      return next;
    }
    case "win": {
      if (!inRange(next, action.side)) throw new Error("invalid side");
      const side = next.sides[action.side]!;
      side.wins = clamp(side.wins + action.delta, 0, Math.ceil(next.bestOf / 2));
      return next;
    }
    case "turn": {
      if (!format.turns) throw new Error("this format does not track turns");
      if (action.side === null) next.turn = null;
      else if (action.side === "next") next.turn = ((next.turn ?? -1) + 1) % next.sides.length;
      else if (inRange(next, action.side)) next.turn = action.side;
      else throw new Error("invalid side");
      return next;
    }
    case "newGame":
      next.sides = next.sides.map((side) => freshSide(format, side.wins));
      next.gameNumber += 1;
      next.turn = format.turns ? 0 : null;
      return next;
    case "resetMatch":
      return { ...initialState(format, next.sides.length, next.bestOf), visible: next.visible };
    case "bestOf":
      if (![1, 3, 5, 7].includes(action.value)) throw new Error("bestOf must be 1, 3, 5 or 7");
      next.bestOf = action.value;
      next.sides = next.sides.map((side) => ({ ...side, wins: Math.min(side.wins, Math.ceil(action.value / 2)) }));
      return next;
    case "visible":
      next.visible = action.value;
      return next;
    default:
      throw new Error("unknown action");
  }
}

export function sideStatus(format: FormatDef, side: SideState): "alive" | "out" | "won" {
  for (const def of format.counters) {
    if (!def.ends) continue;
    const value = side.counters[def.id] ?? def.start;
    const hit = def.ends.when === "lte" ? value <= def.ends.at : value >= def.ends.at;
    if (hit) return def.ends.result === "win" ? "won" : "out";
  }
  for (const def of format.opponentCounters ?? []) {
    if (def.lethal === undefined) continue;
    if (Object.values(side.opponentCounters[def.id] ?? {}).some((value) => value >= def.lethal!)) return "out";
  }
  return "alive";
}

export function sideGroups(format: FormatDef, players: BoardPlayer[]): { name: string; seats: number[] }[] {
  const size = format.teamSize ?? 1;
  const sorted = [...players].sort((a, b) => a.seat - b.seat);
  const sides: { name: string; seats: number[] }[] = [];
  for (let index = 0; index < sorted.length; index += size) {
    const group = sorted.slice(index, index + size);
    sides.push({ name: group.map((player) => player.playerName).join(" & "), seats: group.map((player) => player.seat) });
  }
  return sides;
}

export function sideForSeat(format: FormatDef, seat: number): number {
  return Math.floor(seat / (format.teamSize ?? 1));
}

export function buildBoard(
  match: { id: number; name: string; game: string },
  format: FormatDef,
  players: BoardPlayer[],
  state: MatchState,
): Board {
  const groups = sideGroups(format, players);
  const slots = layoutSlots(groups.length);
  return {
    matchId: match.id,
    matchName: match.name,
    game: match.game,
    format: { id: format.id, name: format.name },
    bestOf: state.bestOf,
    gameNumber: state.gameNumber,
    visible: state.visible,
    sides: groups.map((group, index) => {
      const side = state.sides[index] ?? freshSide(format);
      return {
        index,
        name: group.name,
        seats: group.seats,
        slot: slots[index]!,
        counters: format.counters.map((def) => {
          const value = side.counters[def.id] ?? def.start;
          return {
            id: def.id,
            name: def.name,
            short: def.short,
            value,
            primary: Boolean(def.primary),
            visible: def.showWhen === "always" || value !== 0,
          };
        }),
        opponentCounters: (format.opponentCounters ?? []).flatMap((def) =>
          groups
            .map((other, from) => ({ other, from }))
            .filter(({ from }) => from !== index)
            .map(({ other, from }) => {
              const value = side.opponentCounters[def.id]?.[from] ?? 0;
              return { id: def.id, short: def.short, from, fromName: other.name, value, visible: def.showWhen === "always" || value !== 0 };
            }),
        ),
        wins: side.wins,
        status: sideStatus(format, side),
        active: state.turn === index,
      };
    }),
  };
}
