# Handoff notes

Last updated: 2026-10-09. Read this first when picking the project up again.

## State of the repo

Committed (up to `b4a0bc1`): single frontend app with `/control/` and `/overlay/` pages,
no auth, match formats (MTG Constructed/Commander/Brawl/2HG, Pokemon Standard), life,
poison, commander damage, prizes, turns, best-of score, seat based overlay layout.

Uncommitted, in progress (all typecheck clean when last checked, not yet tested):

| File | Change |
|---|---|
| `compose.yaml` | `app` is now the default service (no profile needed), `restart: unless-stopped`, port/bind from `.env`; `dev` moved behind `--profile dev` with its own volume |
| `.env.example` | Shared by compose and `pnpm start`; adds `BIND_ADDRESS`, `PUBLIC_URL` |
| `backend/src/main.ts` | Loads `.env` from the repo root via `process.loadEnvFile` (verified working) |
| `docs/SETUP.md`, `README.md` | Docker Compose is the recommended path: start/stop/logs/update table, settings, backup/restore |
| `shared/src/types.ts` | `PluginHttp.text()`, optional `GamePlugin.importSources` / `importDeck(url)`, types `DeckImportSource`, `ImportedDeck` |
| `backend/src/services/http.ts`, `plugins.ts`, `shared/src/testing/helpers.ts` | Implement `http.text()` |

## Open tasks, in order

1. **Stopping the container cleanly** (asked last). `docker compose down` / `stop` sends
   SIGTERM; `backend/src/main.ts` already handles SIGINT/SIGTERM with `server.close()`.
   Still to do:
   - Verify the app really exits on SIGTERM within Docker's 10s window (test was cut
     off; the sandbox shell has no `kill` builtin, use `process.kill` from a node script).
   - Node runs as PID 1 in the container. Add `init: true` to the `app` service in
     `compose.yaml` (tini) so signals are forwarded and zombies reaped.
   - Add `stop_grace_period: 15s` to `compose.yaml`.
   - Make sure the SQLite DB is closed on shutdown (`onClose` hook in `app.ts` already
     calls `sqlite.close()`; check the preload queue does not keep the process alive).
   - Document in SETUP.md: `docker compose stop` (pause, keeps container),
     `docker compose down` (remove container, keeps data), never `down -v` unless you
     want to wipe data. Maybe add a "Stop" note in the control panel Settings page.

2. **Limitless TCG deck import for Pokemon** (half done: contract hooks exist).
   - Implement `importDeck(url)` + `importSources` in `games/pokemon/src/` (new file
     `limitless.ts`), returning PTCG Live text that the existing parser already reads.
   - Two verified sources:
     - Community lists `https://limitlesstcg.com/decks/list/<id>`: HTML, robots.txt
       allows all. Title in `<div class="decklist-title">`, headings
       `decklist-column-heading` ("Pokémon (21)", "Trainer (28)", "Energy (11)"), cards
       as `<div class="decklist-card" data-set="TWM" data-number="25">` with
       `card-count` and `card-name` spans.
     - Tournament lists `https://play.limitlesstcg.com/tournament/<tid>/player/<player>/decklist`:
       use the API `GET https://play.limitlesstcg.com/api/tournaments/<tid>/standings`
       (no key needed, rate limit 50 requests per 5 minutes per the `ratelimit` header),
       find the entry with `player === <player>`, `decklist.{pokemon,trainer,energy}[]`
       with `{count,set,number,name}`. Basic energy numbers can be letters (e.g. `W`).
   - Backend: `POST /api/decks/import { game, url }` -> calls plugin, returns
     `{ name, text }` (or create the deck directly).
   - Control UI (`frontend/src/control/components/Decks.svelte`): "Import from URL"
     field, shown only for games that declare `importSources`.
   - Tests: unit test the HTML parser against a saved snippet (offline), online test
     behind `ONLINE_TESTS`.

3. **End a live match** button: take the match off stream (`board: null` to overlay,
   clear `activeId` in `MatchService`), probably also hide the card. Add `POST
   /api/matches/:id/end` or `/api/board/clear`, a button in the Scoreboard, and maybe
   an `endedAt` column.

4. **Scryfall bulk data upload** (user wants to upload the file from their own PC):
   - Bulk files are gzipped JSONL (`.jsonl.gz`, not tar). Stream them with
     `zlib.createGunzip()` + line reader; never load the whole file in memory.
   - Upload via the control panel (Settings, MTG section) to a streaming endpoint
     (`@fastify/multipart` or raw body stream to a temp file in `DATA_DIR`).
   - Import into a local table (e.g. `mtg_bulk_cards`: id, name, set, collector_number,
     JSON) or reuse `cards`, then let the MTG plugin resolve decks locally first and
     fall back to the API. Needs a contract change: give plugins a local lookup or a
     storage hook, as plugins must not touch the DB directly (see ARCHITECTURE.md).
   - Images are not in the bulk file (only URLs), so preload still downloads images.
   - Prices in bulk data go stale after 24h: ignore them. Gameplay data weekly is fine.
   - Discuss the design with the user before building (which bulk file: "Default
     Cards" vs "Oracle Cards"; size of Default Cards is several hundred MB).

5. **Riftbound**: add as a new game plugin `games/riftbound/`. Plan, to discuss first:
   - Card data: the official card gallery JSON
     `https://riftbound.leagueoflegends.com/_next/data/{BUILD_ID}/en-us/card-gallery.json`
     (unofficial, build id changes), the Riot developer API (needs an approved key), or
     Scrydex (paid key). Pick a source with the user; the plugin boundary allows swapping.
   - Sections: legend, champion, main (40), runes (12), battlefields (3), sideboard (0 or 8).
   - Decklist formats: text `<count> x <SET-NUMBER>` lines and the Piltover Archive deck
     code (`@piltoverarchive/riftbound-deck-codes` on npm).
   - Formats: 1v1 to 8 points, 2v2 teams to 11 points, 4 player free-for-all to 8 points.
     Fits the existing format model: one `points` counter, primary, start 0,
     `ends: { at: 8, when: "gte", result: "win" }`, `teamSize: 2` for 2v2.
   - Images are 744x1039 portrait; battlefields are probably landscape (unverified), so
     the overlay may need a landscape card layout hint.

## Useful facts

- Commands: `pnpm test` (offline), `pnpm test:online`, `pnpm typecheck`, `pnpm build`,
  `pnpm start`. In this sandbox `pnpm` is only reachable as `corepack pnpm`; nested
  scripts need a shim on PATH (`/tmp/bin/pnpm` running `corepack pnpm "$@"`).
- Migrations are hand written in `backend/drizzle/` with entries in
  `drizzle/meta/_journal.json` (no snapshots in the repo).
- Game rules live in each plugin's `formats.ts`; `shared/src/match.ts` is the generic
  engine (reducer, win/lose, seat layout) with tests in `shared/test/match.test.ts`.
- Docker was not available in the sandbox, so the image and compose file have never
  been built or run here. Do that first on a real machine.
- No headless browser works in the sandbox, so the overlay layout was never checked
  visually. Open `/overlay/?debug` in a browser with a live match to check it.
