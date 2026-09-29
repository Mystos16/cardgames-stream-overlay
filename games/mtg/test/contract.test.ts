import { gamePluginContractSuite } from "@cso/shared/testing";
import mtg from "../src/index.ts";
import { commanderDeck, standardDeck } from "./samples.ts";

gamePluginContractSuite(mtg, {
  online: Boolean(process.env.ONLINE_TESTS),
  sampleDecklists: [
    { name: "60 card constructed", text: standardDeck, minEntries: 13, minCards: 60 },
    { name: "100 card commander", text: commanderDeck, minEntries: 30, minCards: 100 },
  ],
  onlineSample: "1 Sol Ring\n1 Lightning Bolt (M10) 146\n1 Delver of Secrets\n1 Doubling Season",
});
