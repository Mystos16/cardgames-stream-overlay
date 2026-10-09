# cardgames-stream-overlay

A browser-based stream overlay for trading card games such as **Magic: The Gathering**
and the **Pokemon Trading Card Game**. Add it to OBS or Streamlabs as a Browser Source
and update it live from a separate control panel.

> Status: early development. See the [setup guide](docs/SETUP.md) to get started.

## Features

- Show high resolution card images on stream with one click from a web control panel
- Deck library: import decklists and assign them to 2 or more players per match
  (including 4 player Commander with sideboards and tokens)
- Card data and images fetched on demand or preloaded before a match, then cached,
  so a prepared match works offline
- Games as plugins: Magic via [Scryfall](https://scryfall.com/docs/api), Pokemon via
  [TCGdex](https://tcgdex.dev)
- Stream software as connectors: OBS first (Browser Source), others later
- Runs as a single container (Docker, nerdctl, Kubernetes)

## Architecture

Fastify + Drizzle/SQLite backend, Svelte frontend, pnpm monorepo with `games/*` and
`connectors/*` plugin packages. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Usage

Requirements: Node.js 24+ and pnpm (via `corepack enable`).

```sh
corepack enable
pnpm install          # also generates the plugin registry
pnpm build            # builds the control panel and overlay
pnpm start            # http://localhost:8080/control/
```

Development with hot reload:

```sh
pnpm dev              # backend :8080, frontend :5173/control/ and :5173/overlay/
```

In OBS add a **Browser Source** with the URL shown under Settings in the control panel
(default `http://localhost:8080/overlay/`, 1920x1080). During `pnpm dev` use
`http://localhost:5173/overlay/` instead, or run `pnpm build` once.

Keyboard shortcuts in the Live view: `/` focus filter, `Enter` show, `Esc` hide,
`F` flip double faced card, arrow keys move the selection.

### Container

```sh
docker build -t cardgames-stream-overlay .
docker run --rm -p 127.0.0.1:8080:8080 \
  -v cso-data:/data cardgames-stream-overlay
```

Open `http://localhost:8080/control/`. `docker compose up dev` runs the dev setup in a
container.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to reach it from another PC on your LAN |
| `DATA_DIR` | `./data` | SQLite database and image cache |
| `LOG_LEVEL` | `info` | Fastify log level |
| `PUBLIC_URL` | | Base URL used in the OBS URL when behind a proxy |

### Tests and database migrations

```sh
pnpm test             # parsers and plugin contract suites (offline)
pnpm test:online      # also calls Scryfall and TCGdex
pnpm db:generate      # after editing backend/src/db/schema.ts
```

Migrations in `backend/drizzle/` are applied automatically at startup.

## License

[MIT](LICENSE)

This project is not affiliated with Wizards of the Coast, The Pokemon Company or
Nintendo. Card names and images belong to their respective owners.
