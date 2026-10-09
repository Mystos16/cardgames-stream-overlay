# Architecture

Status: implemented (first version). Pokemon uses TCGdex instead of pokemontcg.io.

## Goals

- Show high resolution card images on stream (OBS first), triggered by a user action
  in a web control panel.
- Load decklists for 2 or more players before a match. Card data and images are
  fetched either on demand (first time shown) or preloaded with a button, and cached.
- Fully modular: games (`games/*`) and stream connectors (`connectors/*`) are plugins.
  Adding a game or connector never requires changes to the core.
- Runs as a single OCI container (Docker for development, also nerdctl and Kubernetes).

Out of scope for now: life/prize counters, timers, scoreboards, other widgets.

## Stack

| Part | Choice |
|---|---|
| Language | TypeScript (Node.js 24) |
| Backend | Fastify, `@fastify/websocket` |
| Database | SQLite via Drizzle ORM (Postgres possible later without rewrite) |
| Frontend | Svelte + Vite |
| Monorepo | pnpm workspaces |
| Container | Single multi-stage image, `/data` volume |

## Repository layout

```
cardgames-stream-overlay/
├── backend/            # Fastify: REST API, WebSocket, Drizzle + SQLite,
│                       # image cache + download queue, plugin registry
├── frontend/
│   ├── control/        # control panel (Svelte)
│   └── overlay/        # shared overlay renderer (Svelte), used by connectors
├── games/
│   ├── mtg/            # decklist parser, Scryfall client, sections, token logic
│   └── pokemon/        # decklist parser, Pokemon card API client, sections
├── connectors/
│   └── obs/            # Browser Source setup/URL; later obs-websocket control
├── shared/             # contracts, common types, contract test suites
├── docs/
├── Dockerfile
├── compose.yaml
├── pnpm-workspace.yaml
├── README.md
└── LICENSE
```

## Responsibilities

| Concern | Owner |
|---|---|
| Which card, parsing, external API calls | Game plugin |
| How it gets onto the stream (URL, remote control) | Connector |
| Rendering and animating the card | Shared overlay renderer |
| Database, cache, download queue, rate limiting, retries | Core backend |
| Settings UI | Core, rendered from each plugin's `settingsSchema` |

Plugins never touch the database or filesystem directly.

## Plugin discovery

Plugins are discovered at **build time**. Every folder under `games/` and `connectors/`
is a pnpm workspace package. A build step generates a registry for both the backend and
the frontend, so plugin UI components are compiled in. Adding a plugin means adding a
folder and rebuilding.

## Contracts (`shared/`)

Both contracts carry an `apiVersion`. The core refuses plugins with a mismatching version.

```ts
interface GamePlugin {
  apiVersion: 1;
  id: string;                         // "mtg", "pokemon"
  name: string;
  sections: SectionDef[];             // e.g. commander, main, sideboard, tokens
  deckRules?: DeckRules;              // e.g. max players, expected sizes (validation hints only)
  settingsSchema: SettingsSchema;
  rateLimit: { requestsPerSecond: number; batchSize?: number };
  parseDecklist(text: string): ParseResult;              // entries + warnings
  resolveCards(entries: DeckEntry[]): Promise<ResolvedCard[]>; // batch capable
  relatedCards?(card: Card): Promise<Card[]>;             // e.g. tokens a card creates
  searchCards?(query: string): Promise<Card[]>;           // cards not in any deck
}

interface Connector {
  apiVersion: 1;
  id: string;                         // "obs"
  name: string;
  settingsSchema: SettingsSchema;
  start(ctx: ConnectorContext): Promise<void>;
  onShow?(event: ShowEvent): Promise<void>;  // optional extra integration (scene switch)
  onHide?(): Promise<void>;
  status(): ConnectorStatus;
}

interface DeckEntry {
  quantity: number;
  name: string;
  section: string;                    // one of the plugin's SectionDef ids
  identifiers: Record<string, string>; // e.g. { set: "M10", number: "146" }
}

interface Card {
  key: string;                        // "<game>:<id>", globally unique
  name: string;
  layout: string;                     // hint for the renderer (normal, double_faced, split, ...)
  faces: CardFace[];                  // one or more faces, each with an image
  meta?: Record<string, unknown>;     // game specific, stored as JSON
}

interface CardFace {
  name: string;
  imageUrl: string;                   // highest resolution available at the source
}
```

## Data model (core owned)

- `decks`: deck library, reusable across matches (`game`, `name`, `raw_text`)
- `deck_entries`: `deck_id`, `section`, `quantity`, `card_key`, `identifiers` (JSON)
- `cards`: `card_key`, `game`, `name`, `layout`, `faces` (JSON), `meta` (JSON), `fetched_at`
- `card_images`: `card_key`, `face_index`, `path`, `status`
- `matches`: `game`, `name`, `created_at`
- `match_players`: `match_id`, `seat`, `player_name`, `deck_id`
- `settings`: key/value per scope (`core`, `game:<id>`, `connector:<id>`)

## Scale: Commander (worst case)

A 4 player Commander match:

| Per player | Cards |
|---|---|
| Deck (incl. 1-2 commanders, partner/background) | 100 |
| Sideboard / maybeboard | ~10-15 |
| Tokens and related cards | ~10-30 |
| **4 players** | **~500-600 entries** |

Design consequences:

- **Batch resolving**: Scryfall `/cards/collection` takes 75 identifiers per call, so a
  full 4 player Commander match is ~8 metadata requests, respecting ~10 req/s.
- **Automatic tokens**: the MTG plugin reads Scryfall `all_parts` (component `token`,
  `meld_part`, etc.) and adds them to a `tokens` section. Tokens can also be pasted
  in the decklist or found with search.
- **Deduplication**: images are cached per `card_key`, so the same card or token in
  multiple decks is downloaded once.
- **Image size**: Scryfall `png` is ~1-1.5 MB, so 600 cards is ~0.6-0.9 GB. A setting
  chooses `png` (default, best quality) or `large` jpg (~150 KB). Cache size is shown
  in settings with a clear-cache button.
- **Download queue**: preload runs in the background with per-deck progress over
  WebSocket, is resumable, and skips cached images. Preload is the default so a
  prepared match works offline.
- **Control panel usability**: 100+ cards per player needs per-player tabs, grouping by
  section (and card type from `meta`), a search/filter box that works across all
  players, and keyboard shortcuts (focus search, Enter to show, Esc to hide).
- **Sections** for MTG: `commander`, `companion`, `main`, `sideboard`, `maybeboard`,
  `tokens`. For Pokemon: `pokemon`, `trainer`, `energy`.
- **Players**: no hard maximum in the core. Games declare hints (Commander: 2-6 seats).

## Flow

```
[Control panel] --click card--> [Backend] --WebSocket show(card)--> [Overlay renderer in OBS]
                                    |
                     image cached? --no--> download queue --> game plugin URLs --> external API
                                    |
                              /data/images/<game>/<id>-<face>.<ext>
```

## Security

- Binds to `localhost` by default.
- When exposed (network, Kubernetes): control token required for the control panel and
  API, separate read-only token for the overlay URL.
- Secrets (e.g. Pokemon API key) only via environment variables, never stored in the
  database or shown in the UI.

## Container

- Single multi-stage image: build frontend and plugins, then a slim Node runtime.
- Port `8080`, non-root user, `/healthz` endpoint.
- Volume `/data` holds `app.db` and `images/`.
- Config via environment: `PORT`, `HOST`, `DATA_DIR`, `LOG_LEVEL`, `CONTROL_TOKEN`,
  `OVERLAY_TOKEN`, `POKEMONTCG_API_KEY`.
- `compose.yaml` for local development with hot reload.

## External APIs

- **Scryfall**: send a descriptive `User-Agent` and `Accept` header, respect rate limits,
  cache aggressively, do not crop artist/copyright lines.
- **Pokemon**: verify the current state of pokemontcg.io before implementing. The plugin
  boundary allows swapping the source without core changes.

## Testing

`shared/` exposes contract test suites. Every game plugin must pass, for example:
parses sample decklists (including a 100 card Commander list), resolves to cards with at
least one face and image URL, keys are prefixed with the game id. Connectors have an
equivalent suite.
