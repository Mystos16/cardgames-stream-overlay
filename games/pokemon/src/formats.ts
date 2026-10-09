import type { FormatDef } from "@cso/shared";

export const POKEMON_FORMATS: FormatDef[] = [
  {
    id: "standard",
    name: "Standard (6 prizes)",
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    turns: true,
    counters: [
      {
        id: "prizes",
        name: "Prize cards left",
        short: "Prizes",
        start: 6,
        min: 0,
        max: 6,
        primary: true,
        showWhen: "always",
        ends: { at: 0, when: "lte", result: "win" },
      },
    ],
  },
];
