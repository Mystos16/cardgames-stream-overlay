import { PLUGIN_API_VERSION, defineGame, type GamePlugin } from "@cso/shared";
import { POKEMON_FORMATS } from "./formats.ts";
import { parseDecklist } from "./parser.ts";
import { TcgdexClient } from "./tcgdex.ts";

export default defineGame({
  apiVersion: PLUGIN_API_VERSION,
  id: "pokemon",
  create(ctx): GamePlugin {
    const client = new TcgdexClient(ctx);
    return {
      apiVersion: PLUGIN_API_VERSION,
      id: "pokemon",
      name: "Pokemon Trading Card Game",
      sections: [
        { id: "pokemon", name: "Pokemon" },
        { id: "trainer", name: "Trainer" },
        { id: "energy", name: "Energy" },
      ],
      deckRules: { minPlayers: 2, maxPlayers: 2, expectedSizes: { pokemon: { min: 1 } } },
      formats: POKEMON_FORMATS,
      settingsSchema: {
        fields: [
          {
            key: "language",
            label: "Card language",
            type: "select",
            default: "en",
            options: [
              { value: "en", label: "English" },
              { value: "fr", label: "French" },
              { value: "de", label: "German" },
              { value: "it", label: "Italian" },
              { value: "es", label: "Spanish" },
              { value: "pt", label: "Portuguese" },
              { value: "ja", label: "Japanese" },
            ],
          },
          {
            key: "imageFormat",
            label: "Image format",
            type: "select",
            default: "png",
            options: [
              { value: "png", label: "PNG (best)" },
              { value: "webp", label: "WebP (smaller)" },
            ],
          },
        ],
      },
      rateLimit: { requestsPerSecond: 5 },
      parseDecklist,
      resolveCards: (entries) => client.resolve(entries),
      searchCards: (query) => client.search(query),
    };
  },
});
