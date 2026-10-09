# Setup guide

This guide takes you from nothing to a card showing on stream in OBS.

## 1. Choose how to run it

| Option | Best for | Requirements |
|---|---|---|
| A. Node.js on the streaming PC | Simplest, single PC | Node.js 24+ |
| B. Container | Running on a server or home lab | Docker, nerdctl or Kubernetes |

The overlay must be reachable from the PC running OBS. If the app runs on the same PC
as OBS, keep the defaults (it only listens on `127.0.0.1`).

### Option A: Node.js

1. Install [Node.js 24 or newer](https://nodejs.org/).
2. In a terminal, from the project folder:

   ```sh
   corepack enable
   pnpm install
   pnpm build
   pnpm start
   ```

   If `pnpm` is not found after `corepack enable`, use `corepack pnpm <command>`
   instead.
3. Open <http://localhost:8080/control/>.

Data (database and image cache) is stored in `./data`. Copy `.env.example` to `.env`
and edit it to change settings, or set environment variables directly.

### Option B: Container

```sh
docker build -t cardgames-stream-overlay .
docker run -d --name cso --restart unless-stopped \
  -p 127.0.0.1:8080:8080 \
  -e CONTROL_TOKEN=<long-random-string> \
  -e OVERLAY_TOKEN=<another-long-random-string> \
  -v cso-data:/data \
  cardgames-stream-overlay
```

Or with compose: put `CONTROL_TOKEN` and `OVERLAY_TOKEN` in `.env`, then run
`docker compose --profile prod up -d app`.

Open `http://<host>:8080/control/?token=<CONTROL_TOKEN>` once. The browser remembers
the token and removes it from the address bar.

To make the app reachable from another PC, publish the port on a LAN address
(`-p 8080:8080`) instead of `127.0.0.1`. Tokens are always required in a container.

Generate tokens with for example `openssl rand -hex 24`.

## 2. Configure games (optional)

Open **Settings** in the control panel.

- **Magic: The Gathering**: image quality (PNG is best but ~1.2 MB per card; a 4 player
  Commander match is roughly 0.7 GB; Large JPG is ~150 KB per card) and whether tokens
  are added automatically.
- **Pokemon**: card language and image format.

The cache size and a **Clear cache** button are also shown here.

## 3. Add decks

Go to **Deck library**, choose the game, give the deck a name and paste a decklist.

Supported formats:

- **Magic**: MTG Arena / MTGO / Moxfield / Archidekt exports, e.g. `1 Sol Ring (C21) 263`
  or `1 Sol Ring`. Section headers such as `Commander`, `Sideboard`, `Companion`,
  `Maybeboard` are recognized.
- **Pokemon**: Pokemon TCG Live exports, e.g. `4 Pikachu ex SSP 57`, with `Pokemon:`,
  `Trainer:` and `Energy:` headers.

After saving, the cards are looked up. Lines that could not be matched are shown with
a warning; fix the line (for example remove the set code) and save again. Cards not in
the list (tokens, emblems) can be added with search.

## 4. Create a match

Go to **Matches**, create a match, add a seat per player (2 or more, e.g. 4 for
Commander) and pick each player's deck.

Click **Preload** before going live. This downloads all card images so the match also
works if the internet connection drops. Progress is shown per deck.

## 5. Add the overlay to OBS

1. In the control panel open **Settings** and copy the **OBS Browser Source URL**. It
   already contains the position, card size and (when set) the overlay token.
2. In OBS: **Sources** > **+** > **Browser**, name it e.g. "Card overlay".
3. Paste the URL, set **Width** `1920` and **Height** `1080` (match your canvas, and
   the values in Settings).
4. Leave **Custom CSS** empty. The background is transparent.
5. Optional: enable **Refresh browser when scene becomes active** if you switch scenes
   often.
6. Place the source above your game capture.

Use the overlay token in OBS, never the control token: the overlay token can only
display cards.

Streamlabs and other software that supports a browser source work the same way.

## 6. Go live

Open the match and use the **Live** view:

| Key | Action |
|---|---|
| `/` | Focus the filter box (searches all players) |
| Arrow keys | Move the selection |
| `Enter` | Show the selected card on stream |
| `F` | Flip a double faced card |
| `Esc` | Hide the card |

Clicking a card does the same as `Enter`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing appears in OBS | Open the overlay URL in a normal browser and show a card. If it works there, right click the source in OBS > **Refresh**. Check width/height |
| `401` / control panel asks for a token | Add `?token=<CONTROL_TOKEN>` to the URL |
| Overlay works in browser but not in OBS on another PC | The app listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` (requires tokens) and open the port in your firewall |
| Card shows a placeholder or "not found" | Fix the decklist line, or add the card with search |
| Behind a reverse proxy the OBS URL is wrong | Set `PUBLIC_URL` to the external base URL |
| Disk filling up | Switch MTG to Large JPG and clear the cache in Settings |

## Updating

- Node.js: `git pull && pnpm install && pnpm build`, then restart `pnpm start`.
- Container: rebuild the image and recreate the container. Data in the `/data` volume is
  kept; database migrations run automatically at startup.

## Backup

Everything lives in `DATA_DIR` (`./data` or the `/data` volume): `app.db` holds decks,
matches and settings; `images/` is only a cache and can be deleted at any time.
