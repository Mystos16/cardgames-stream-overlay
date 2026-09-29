import type { DeckEntry, ParseResult, ParseWarning } from "@cso/shared";

const HEADER = /^(?<name>pok[eé]mon|trainers?|energy|energies)\s*(?:[:(-]\s*\d*\)?)?\s*$/i;
const CARD_LINE = /^(?:\*\s*)?(?<qty>\d+)\s*x?\s+(?<name>.+?)(?:\s+(?<set>[A-Z0-9-]{2,8})\s+(?<number>[A-Za-z0-9-]+))?$/;
const BASIC_ENERGY = /^(?:basic\s+)?(?:\{[A-Z]\}|grass|fire|water|lightning|psychic|fighting|darkness|metal|fairy)\s+energy$/i;

function sectionFor(header: string): string {
  const lower = header.toLowerCase();
  if (lower.startsWith("pok")) return "pokemon";
  if (lower.startsWith("trainer")) return "trainer";
  return "energy";
}

export function parseDecklist(text: string): ParseResult {
  const entries: DeckEntry[] = [];
  const warnings: ParseWarning[] = [];
  let section: string | undefined;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) return;
    if (/^total cards/i.test(line)) return;

    const header = HEADER.exec(line);
    if (header?.groups) {
      section = sectionFor(header.groups.name!);
      return;
    }

    const match = CARD_LINE.exec(line);
    if (!match?.groups) {
      warnings.push({ line: index + 1, text: rawLine, message: "not a card line (expected '<qty> <name> <SET> <number>')" });
      return;
    }

    const name = match.groups.name!.trim();
    const identifiers: Record<string, string> = {};
    if (match.groups.set && match.groups.number) {
      identifiers.set = match.groups.set;
      identifiers.number = match.groups.number;
    }
    const entrySection = section ?? (BASIC_ENERGY.test(name) || /\benergy$/i.test(name) ? "energy" : "pokemon");
    entries.push({ quantity: Number(match.groups.qty), name, section: entrySection, identifiers });
  });

  return { entries, warnings };
}
