import { describe, expect, it } from "vitest";
import { parseDecklist } from "../src/parser.ts";
import { commanderDeck, moxfieldStyle, standardDeck } from "./samples.ts";

describe("mtg decklist parser", () => {
  it("reads set and collector number", () => {
    const { entries } = parseDecklist(standardDeck);
    expect(entries[0]).toEqual({
      quantity: 4,
      name: "Lightning Bolt",
      section: "main",
      identifiers: { set: "m10", number: "146" },
    });
  });

  it("handles section headers", () => {
    const { entries } = parseDecklist(commanderDeck);
    expect(entries.find((entry) => entry.section === "commander")?.name).toBe("Atraxa, Praetors' Voice");
    expect(entries.find((entry) => entry.section === "maybeboard")?.name).toBe("Doubling Season");
    expect(entries.find((entry) => entry.section === "tokens")?.name).toBe("Treasure");
    expect(entries.filter((entry) => entry.section === "main").reduce((sum, entry) => sum + entry.quantity, 0)).toBe(99);
  });

  it("handles moxfield markers, double faced names and SB: prefix", () => {
    const { entries, warnings } = parseDecklist(moxfieldStyle);
    expect(warnings).toEqual([]);
    expect(entries[0]!.section).toBe("commander");
    expect(entries[1]!.name).toBe("Delver of Secrets // Insectile Aberration");
    expect(entries[1]!.identifiers).toEqual({ set: "isd", number: "51" });
    expect(entries[2]).toMatchObject({ name: "Negate", section: "sideboard" });
  });

  it("warns on unparseable lines", () => {
    const { warnings } = parseDecklist("Lightning Bolt");
    expect(warnings).toHaveLength(1);
  });
});
