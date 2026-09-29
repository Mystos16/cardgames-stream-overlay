import { describe, expect, it } from "vitest";
import { parseDecklist } from "../src/parser.ts";
import { ptcglDeck } from "./samples.ts";

describe("pokemon decklist parser", () => {
  it("parses PTCGL export with sections", () => {
    const { entries, warnings } = parseDecklist(ptcglDeck);
    expect(warnings).toEqual([]);
    expect(entries[0]).toEqual({ quantity: 4, name: "Miraidon ex", section: "pokemon", identifiers: { set: "SVI", number: "81" } });
    expect(entries.find((entry) => entry.name === "Nest Ball")?.section).toBe("trainer");
    expect(entries.at(-1)).toMatchObject({ quantity: 12, section: "energy" });
  });

  it("parses lines without set info", () => {
    const { entries } = parseDecklist("2 Boss's Orders");
    expect(entries[0]).toMatchObject({ quantity: 2, name: "Boss's Orders", identifiers: {} });
  });
});
