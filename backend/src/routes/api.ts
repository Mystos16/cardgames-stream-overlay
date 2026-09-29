import type { FastifyInstance } from "fastify";
import type { Card } from "@cso/shared";
import type { App } from "../app.ts";

function id(params: unknown): number {
  const value = Number((params as { id: string }).id);
  if (!Number.isInteger(value)) throw Object.assign(new Error("invalid id"), { statusCode: 400 });
  return value;
}

export async function apiRoutes(server: FastifyInstance, app: App): Promise<void> {
  const { plugins, decks, matches, cards, overlay, images, preload, settings, config } = app;

  server.get("/api/games", async () =>
    [...plugins.games.values()].map(({ plugin }) => ({
      id: plugin.id,
      name: plugin.name,
      sections: plugin.sections,
      deckRules: plugin.deckRules,
      canSearch: Boolean(plugin.searchCards),
    })),
  );

  server.get("/api/decks", async (request) => decks.list((request.query as { game?: string }).game));
  server.get("/api/decks/:id", async (request) => decks.get(id(request.params)));
  server.post("/api/decks", {
    schema: {
      body: {
        type: "object",
        required: ["game", "name", "rawText"],
        properties: { game: { type: "string" }, name: { type: "string", minLength: 1 }, rawText: { type: "string" } },
      },
    },
    handler: async (request) => {
      const body = request.body as { game: string; name: string; rawText: string };
      return decks.create(body.game, body.name, body.rawText);
    },
  });
  server.put("/api/decks/:id", async (request) => {
    const body = request.body as { name?: string; rawText?: string };
    return decks.update(id(request.params), body.name, body.rawText);
  });
  server.delete("/api/decks/:id", async (request, reply) => {
    await decks.remove(id(request.params));
    return reply.code(204).send();
  });
  server.post("/api/decks/:id/resolve", async (request) => decks.resolve(id(request.params)));
  server.post("/api/decks/:id/preload", async (request) => decks.startPreload(await decks.get(id(request.params))));
  server.post("/api/decks/:id/cards", async (request) => {
    const body = request.body as { cardKey: string; section: string };
    const card = (await cards.get([body.cardKey])).get(body.cardKey);
    if (!card) throw Object.assign(new Error("card not cached, search for it first"), { statusCode: 404 });
    return decks.addCard(id(request.params), card, body.section);
  });

  server.get("/api/matches", async () => matches.list());
  server.get("/api/matches/:id", async (request) => matches.get(id(request.params)));
  server.post("/api/matches", async (request) => {
    const body = request.body as { game: string; name: string; players?: { playerName: string; deckId: number | null }[] };
    return matches.create(body.game, body.name, body.players ?? []);
  });
  server.put("/api/matches/:id", async (request) => {
    const body = request.body as { name?: string; players?: { playerName: string; deckId: number | null }[] };
    return matches.update(id(request.params), body.name, body.players);
  });
  server.delete("/api/matches/:id", async (request, reply) => {
    await matches.remove(id(request.params));
    return reply.code(204).send();
  });
  server.post("/api/matches/:id/preload", async (request) => matches.preload(id(request.params)));

  server.get("/api/search", async (request) => {
    const query = request.query as { game?: string; q?: string };
    if (!query.game || !query.q) throw Object.assign(new Error("game and q are required"), { statusCode: 400 });
    return cards.search(query.game, query.q);
  });

  server.get("/api/preload", async () => preload.status());

  server.get("/api/overlay", async () => overlay.state());
  server.post("/api/overlay/show", async (request) => {
    const body = request.body as { cardKey: string; face?: number; playerName?: string };
    const card: Card | undefined = (await cards.get([body.cardKey])).get(body.cardKey);
    if (!card) throw Object.assign(new Error("unknown card"), { statusCode: 404 });
    return overlay.show(card, body.face ?? 0, body.playerName);
  });
  server.post("/api/overlay/flip", async () => overlay.flip());
  server.post("/api/overlay/hide", async (_request, reply) => {
    await overlay.hide();
    return reply.code(204).send();
  });

  server.get("/api/settings", async () =>
    settings.scopes().map(({ scope, schema }) => ({ scope, schema, values: settings.get(scope) })),
  );
  server.put("/api/settings/:scope", async (request) => {
    const scope = (request.params as { scope: string }).scope;
    return settings.set(scope, request.body as Record<string, unknown>);
  });

  server.get("/api/cache", async () => images.size());
  server.delete("/api/cache", async (_request, reply) => {
    await images.clear();
    return reply.code(204).send();
  });

  server.get("/api/connectors", async (request) => {
    const base = config.publicUrl ?? `${request.protocol}://${request.host}`;
    return [...plugins.connectors.values()].map((connector) => ({
      id: connector.id,
      name: connector.name,
      status: connector.status(),
      info: connector.info?.() ?? {},
      baseUrl: base,
    }));
  });
}
