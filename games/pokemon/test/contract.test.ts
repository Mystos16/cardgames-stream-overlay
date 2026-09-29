import { gamePluginContractSuite } from "@cso/shared/testing";
import pokemon from "../src/index.ts";
import { ptcglDeck } from "./samples.ts";

gamePluginContractSuite(pokemon, {
  online: Boolean(process.env.ONLINE_TESTS),
  sampleDecklists: [{ name: "PTCGL export", text: ptcglDeck, minEntries: 14, minCards: 60 }],
});
