import type { CounterDef, FormatDef } from "@cso/shared";

const life = (start: number): CounterDef => ({
  id: "life",
  name: "Life",
  short: "Life",
  start,
  primary: true,
  showWhen: "always",
  ends: { at: 0, when: "lte", result: "lose" },
});

const poison = (lethal: number): CounterDef => ({
  id: "poison",
  name: "Poison",
  short: "Poison",
  start: 0,
  min: 0,
  showWhen: "nonzero",
  ends: { at: lethal, when: "gte", result: "lose" },
});

export const MTG_FORMATS: FormatDef[] = [
  { id: "constructed", name: "Constructed (20 life)", minPlayers: 2, maxPlayers: 6, defaultPlayers: 2, counters: [life(20), poison(10)] },
  {
    id: "commander",
    name: "Commander (40 life)",
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 4,
    counters: [life(40), poison(10)],
    opponentCounters: [{ id: "commander", name: "Commander damage", short: "Cmdr", showWhen: "nonzero", lethal: 21, alsoCounter: "life" }],
  },
  {
    id: "brawl",
    name: "Brawl (25 life)",
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 4,
    counters: [life(25), poison(10)],
  },
  { id: "brawl-1v1", name: "Brawl 1v1 (20 life)", minPlayers: 2, maxPlayers: 2, defaultPlayers: 2, counters: [life(20), poison(10)] },
  {
    id: "two-headed-giant",
    name: "Two-Headed Giant (30 life per team)",
    minPlayers: 4,
    maxPlayers: 4,
    defaultPlayers: 4,
    teamSize: 2,
    counters: [life(30), poison(15)],
  },
];
