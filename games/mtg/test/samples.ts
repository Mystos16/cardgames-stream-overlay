export const standardDeck = `Deck
4 Lightning Bolt (M10) 146
4x Goblin Guide
20 Mountain
4 Monastery Swiftspear
4 Lava Spike
4 Rift Bolt
4 Skewer the Critics
4 Light Up the Stage
4 Eidolon of the Great Revel
4 Searing Blaze
4 Skullcrack

Sideboard
2 Smash to Smithereens
3 Path to Exile
`;

const commanderStaples = [
  "Sol Ring", "Arcane Signet", "Command Tower", "Swords to Plowshares", "Path to Exile",
  "Counterspell", "Cultivate", "Kodama's Reach", "Rampant Growth", "Beast Within",
  "Chaos Warp", "Cyclonic Rift", "Rhystic Study", "Mystic Remora", "Smothering Tithe",
  "Esper Sentinel", "Swiftfoot Boots", "Lightning Greaves", "Heroic Intervention", "Teferi's Protection",
  "Fellwar Stone", "Mind Stone", "Thought Vessel", "Talisman of Progress", "Talisman of Unity",
  "Exotic Orchard", "Reflecting Pool", "Path of Ancestry", "Evolving Wilds", "Terramorphic Expanse",
];

export const commanderDeck = [
  "Commander",
  "1 Atraxa, Praetors' Voice",
  "",
  "Deck",
  ...commanderStaples.map((name) => `1 ${name}`),
  "18 Forest",
  "17 Island",
  "17 Plains",
  "17 Swamp",
  "",
  "Maybeboard",
  "1 Doubling Season",
  "",
  "Tokens",
  "1 Treasure",
].join("\n");

export const moxfieldStyle = `1 Atraxa, Praetors' Voice (2X2) 190 *CMDR*
1 Delver of Secrets // Insectile Aberration (ISD) 51 *F*
SB: 1 Negate
`;
