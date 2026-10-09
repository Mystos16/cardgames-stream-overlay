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
  -v cso-data:/data \
  cardgames-stream-overlay
```

Or with compose: `docker compose --profile prod up -d app`.

Open `http://<host>:8080/control/`.

To make the app reachable from another PC, publish the port on a LAN address
(`-p 8080:8080`) instead of `127.0.0.1`. There is no login, so only do this on a
trusted home network.

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

Go to **Matches**, create a match, pick the game and **format**, name the players and pick
each player's deck. Seat order decides where a player is shown on stream.

| Game | Format | Players | Tracks |
|---|---|---|---|
| Magic | Constructed | 2-6 | 20 life, poison (10 loses) |
| Magic | Commander | 2-6 | 40 life, poison, commander damage per opponent (21 loses, also lowers life) |
| Magic | Brawl / Brawl 1v1 | 2-6 / 2 | 25 / 20 life, poison |
| Magic | Two-Headed Giant | 4 (2 teams) | 30 shared life per team, 15 poison |
| Pokemon | Standard | 2 | Prize cards left (6), whose turn it is |

Where players appear on stream:

| Players | Layout |
|---|---|
| 2 | Seat 1 left, seat 2 right |
| 3 | Top left, top right, bottom middle |
| 4 | The four corners, clockwise from top left |
| 5 / 6 | The corners plus top middle (and bottom middle) |

Each player gets a panel with their name and life (or prizes). Poison and commander
damage only appear once they are above 0. A shown card appears next to the panel of the
player whose deck it is in, and cards are smaller with 3 or more players so they don't
cover the board. Cards from search (not in a deck) appear in the middle.

Click **Preload** before going live. This downloads all card images so the match also
works if the internet connection drops. Progress is shown per deck.

## 5. Add the overlay to OBS

1. In the control panel open **Settings** and copy the **OBS Browser Source URL**. It
   already contains the maximum card size and whether the player panels are shown.
2. In OBS: **Sources** > **+** > **Browser**, name it e.g. "Card overlay".
3. Paste the URL, set **Width** `1920` and **Height** `1080` (match your canvas, and
   the values in Settings).
4. Leave **Custom CSS** empty. The background is transparent.
5. Optional: enable **Refresh browser when scene becomes active** if you switch scenes
   often.
6. Place the source above your game capture.

Streamlabs and other software that supports a browser source work the same way.

## 6. Go live

Open the **Live** view and pick the match. Picking it puts its player panels on stream
(or use **Put this match on stream**). The scoreboard at the top has buttons for every
counter; **Show on stream** hides the panels without losing anything.

- **Best of**: set 1, 3, 5 or 7 to show match wins as dots next to the names. Use the
  win `+`/`-` buttons after each game.
- **Next game**: resets life and counters for the next game, keeps the score.
- **Reset match**: everything back to the start, including the score.
- A player at 0 life, 10 poison or 21 commander damage from one opponent is greyed
  out; in Pokemon the player who takes their last prize is marked as the winner.

Everything is saved immediately, so a page refresh or restart keeps the scores.

Keyboard shortcuts:

| Key | Action |
|---|---|
| `Alt+1` .. `Alt+6` | Select a player (or click their box) |
| `+` / `-` | Selected player's life or prizes +1 / -1 (`Shift` for 5) |
| `P` / `Shift+P` | Selected player's poison +1 / -1 (Magic) |
| `T` | Next turn (Pokemon) |
| `/` | Focus the card filter (searches all players) |
| Arrow keys | Move the card selection |
| `Enter` | Show the selected card on stream |
| `F` | Flip a double faced card |
| `Esc` | Hide the card |

Clicking a card does the same as `Enter`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Nothing appears in OBS | Open the overlay URL in a normal browser and show a card. If it works there, right click the source in OBS > **Refresh**. Check width/height |
| Overlay works in browser but not in OBS on another PC | The app listens on `127.0.0.1` by default. Set `HOST=0.0.0.0` and open the port in your firewall |
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
