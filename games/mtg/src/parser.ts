import type { DeckEntry, ParseResult, ParseWarning } from "@cso/shared";

const HEADERS: Record<string, string> = {
  commander: "commander",
  commanders: "commander",
  companion: "companion",
  deck: "main",
  main: "main",
  maindeck: "main",
  mainboard: "main",
  sideboard: "sideboard",
  side: "sideboard",
  sb: "sideboard",
  maybeboard: "maybeboard",
  maybe: "maybeboard",
  considering: "maybeboard",
  tokens: "tokens",
  token: "tokens",
};

const CARD_LINE = /^(?<qty>\d+)\s*x?\s+(?<rest>.+)$/i;
const SET_SUFFIX = /\s+\((?<set>[a-z0-9]{2,6})\)(?:\s+(?<number>[^\s*]+))?/i;
const MARKERS = /\s+\*(?<marker>[a-z]+)\*/gi;

function headerSection(line: string): string | undefined {
  const cleaned = line
    .replace(/^\/\/\s*/, "")
    .replace(/^#+\s*/, "")
    .replace(/:$/, "")
    .replace(/\s*\(\d+\)$/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return HEADERS[cleaned];
}

export function parseDecklist(text: string): ParseResult {
  const entries: DeckEntry[] = [];
  const warnings: ParseWarning[] = [];
  let section = "main";

  text.split(/\r?\n/).forEach((rawLine, index) => {
    let line = rawLine.trim();
    const lineNo = index + 1;
    if (!line) return;

    const header = headerSection(line);
    if (header) {
      section = header;
      return;
    }
    if (line.startsWith("//") || line.startsWith("#")) return;

    let entrySection = section;
    if (/^sb:\s*/i.test(line)) {
      entrySection = "sideboard";
      line = line.replace(/^sb:\s*/i, "");
    }

    const match = CARD_LINE.exec(line);
    if (!match?.groups) {
      warnings.push({ line: lineNo, text: rawLine, message: "not a card line (expected '<qty> <name>')" });
      return;
    }

    let rest = match.groups.rest!;
    for (const marker of rest.matchAll(MARKERS)) {
      const value = marker.groups!.marker!.toLowerCase();
      if (value === "cmdr") entrySection = "commander";
    }
    rest = rest.replace(MARKERS, "");
    rest = rest.replace(/\s+\[[^\]]*\]$/, "");

    const identifiers: Record<string, string> = {};
    const setMatch = SET_SUFFIX.exec(rest);
    if (setMatch?.groups) {
      identifiers.set = setMatch.groups.set!.toLowerCase();
      if (setMatch.groups.number) identifiers.number = setMatch.groups.number;
      rest = rest.slice(0, setMatch.index);
    }

    const name = rest.replace(/\s+\/\/?\s+/g, " // ").trim();
    if (!name) {
      warnings.push({ line: lineNo, text: rawLine, message: "missing card name" });
      return;
    }

    entries.push({ quantity: Number(match.groups.qty), name, section: entrySection, identifiers });
  });

  return { entries, warnings };
}
