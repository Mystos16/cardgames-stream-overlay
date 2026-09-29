import { PLUGIN_API_VERSION, defineGame, type GamePlugin } from "@cso/shared";
import { parseDecklist } from "./parser.ts";
import { ScryfallClient } from "./scryfall.ts";

export const MTG_SECTIONS = [
  { id: "commander", name: "Commander" },
  { id: "companion", name: "Companion" },
  { id: "main", name: "Main deck" },
  { id: "sideboard", name: "Sideboard" },
  { id: "maybeboard", name: "Maybeboard" },
  { id: "tokens", name: "Tokens and related" },
];

export default defineGame({
  apiVersion: PLUGIN_API_VERSION,
  id: "mtg",
  create(ctx): GamePlugin {
    const client = new ScryfallClient(ctx);
    return {
      apiVersion: PLUGIN_API_VERSION,
      id: "mtg",
      name: "Magic: The Gathering",
      sections: MTG_SECTIONS,
      deckRules: {
        minPlayers: 2,
        maxPlayers: 6,
        expectedSizes: { main: { min: 40 }, commander: { max: 2 }, sideboard: { max: 15 } },
      },
      settingsSchema: {
        fields: [
          {
            key: "imageFormat",
            label: "Image quality",
            type: "select",
            default: "png",
            options: [
              { value: "png", label: "PNG (best, ~1.2 MB per card)" },
              { value: "large", label: "Large JPG (~150 KB per card)" },
            ],
          },
          {
            key: "autoTokens",
            label: "Add tokens and related cards automatically",
            type: "boolean",
            default: true,
          },
        ],
      },
      rateLimit: { requestsPerSecond: 8, batchSize: 75 },
      parseDecklist,
      resolveCards: (entries) => client.resolve(entries),
      relatedCards: (card) => client.related(card),
      searchCards: (query) => client.search(query),
    };
  },
});
