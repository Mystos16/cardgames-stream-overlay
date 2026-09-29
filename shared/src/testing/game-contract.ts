import { describe, expect, it } from "vitest";
import { PLUGIN_API_VERSION, type GamePlugin, type GamePluginFactory } from "../types.ts";
import { createTestGameContext } from "./helpers.ts";

export interface GameContractOptions {
  sampleDecklists: { name: string; text: string; minEntries: number; minCards?: number }[];
  online?: boolean;
  onlineSample?: string;
}

export function gamePluginContractSuite(factory: GamePluginFactory, options: GameContractOptions): void {
  const plugin: GamePlugin = factory.create(createTestGameContext());

  describe(`game plugin contract: ${factory.id}`, () => {
    it("has matching api version and id", () => {
      expect(factory.apiVersion).toBe(PLUGIN_API_VERSION);
      expect(plugin.apiVersion).toBe(PLUGIN_API_VERSION);
      expect(plugin.id).toBe(factory.id);
      expect(plugin.id).toMatch(/^[a-z0-9-]+$/);
    });

    it("declares sections and a sane rate limit", () => {
      expect(plugin.sections.length).toBeGreaterThan(0);
      const ids = plugin.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(plugin.rateLimit.requestsPerSecond).toBeGreaterThan(0);
    });

    for (const sample of options.sampleDecklists) {
      it(`parses sample decklist: ${sample.name}`, () => {
        const result = plugin.parseDecklist(sample.text);
        expect(result.entries.length).toBeGreaterThanOrEqual(sample.minEntries);
        const sectionIds = new Set(plugin.sections.map((section) => section.id));
        for (const entry of result.entries) {
          expect(entry.quantity).toBeGreaterThan(0);
          expect(entry.name.length).toBeGreaterThan(0);
          expect(sectionIds.has(entry.section)).toBe(true);
        }
        if (sample.minCards !== undefined) {
          const total = result.entries.reduce((sum, entry) => sum + entry.quantity, 0);
          expect(total).toBeGreaterThanOrEqual(sample.minCards);
        }
      });
    }

    it("returns warnings instead of throwing on garbage input", () => {
      const result = plugin.parseDecklist("%%%\n\n???");
      expect(Array.isArray(result.entries)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it.runIf(options.online)("resolves cards with faces, image urls and prefixed keys", async () => {
      const text = options.onlineSample ?? options.sampleDecklists[0]?.text ?? "";
      const entries = plugin.parseDecklist(text).entries.slice(0, 5);
      const resolved = await plugin.resolveCards(entries);
      expect(resolved.length).toBe(entries.length);
      const found = resolved.filter((item) => item.card);
      expect(found.length).toBeGreaterThan(0);
      for (const item of found) {
        const card = item.card!;
        expect(card.key.startsWith(`${plugin.id}:`)).toBe(true);
        expect(card.faces.length).toBeGreaterThan(0);
        for (const face of card.faces) expect(face.imageUrl).toMatch(/^https:\/\//);
      }
    });
  });
}
