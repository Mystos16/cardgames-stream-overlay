<script lang="ts">
  import type { Board, BoardSide, OverlayMessage, OverlayShowMessage, Slot } from "@cso/shared";

  const params = new URLSearchParams(location.search);
  const fallbackSlot = (params.get("position") ?? "center") as Slot | "center";
  const maxCardHeight = Math.min(80, Math.max(10, Number(params.get("cardHeight") ?? 55)));
  const showBoard = params.get("board") !== "0";
  const debug = params.has("debug");

  let current = $state<OverlayShowMessage | null>(null);
  let visible = $state(false);
  let connected = $state(false);
  let board = $state<Board | null>(null);

  const sideCount = $derived(board?.sides.length ?? 0);
  const cardHeight = $derived(Math.min(maxCardHeight, sideCount > 2 ? 34 : 60));
  const cardSlot = $derived<Slot | "center">(current?.slot ?? fallbackSlot);
  const boardShown = $derived(showBoard && Boolean(board?.visible));
  const cardInPanel = $derived(boardShown && Boolean(board?.sides.some((side) => side.slot === cardSlot)));

  function preload(urls: string[]): Promise<void> {
    return Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.onload = image.onerror = () => resolve();
            image.src = url;
          }),
      ),
    ).then(() => undefined);
  }

  async function handle(message: OverlayMessage): Promise<void> {
    if (message.type === "show") {
      await preload(message.images);
      if (current && visible && current.id !== message.id) {
        visible = false;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      current = message;
      visible = true;
    } else if (message.type === "flip" && current) {
      current = { ...current, face: message.face };
    } else if (message.type === "hide") {
      visible = false;
    } else if (message.type === "board") {
      board = message.board;
    }
  }

  function connect(delay = 1000): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws/overlay`);
    socket.onopen = () => {
      connected = true;
      delay = 1000;
    };
    socket.onmessage = (event) => void handle(JSON.parse(event.data) as OverlayMessage);
    socket.onclose = () => {
      connected = false;
      setTimeout(() => connect(Math.min(delay * 2, 15000)), delay);
    };
  }

  connect();

  function primary(side: BoardSide) {
    return side.counters.find((counter) => counter.primary);
  }

  function wins(side: BoardSide, bestOf: number): boolean[] {
    const needed = Math.ceil(bestOf / 2);
    return Array.from({ length: needed }, (_, index) => index < side.wins);
  }
</script>

<main class="stage" style="--card-height: {cardHeight}vh">
  {#if boardShown && board}
    {#each board.sides as side (side.index)}
      {@const main = primary(side)}
      <div class="slot slot-{side.slot}">
        <section class="panel" class:active={side.active} class:out={side.status === "out"} class:won={side.status === "won"}>
          <header>
            {#if side.active}<span class="turn" aria-label="current turn"></span>{/if}
            <span class="name">{side.name}</span>
            {#if board.bestOf > 1}
              <span class="wins">
                {#each wins(side, board.bestOf) as filled, index (index)}<i class:filled></i>{/each}
              </span>
            {/if}
          </header>
          <div class="values">
            {#if main}
              <div class="primary">
                <span class="value">{main.value}</span>
                <span class="label">{main.short}</span>
              </div>
            {/if}
            <div class="secondary">
              {#each side.counters.filter((counter) => !counter.primary && counter.visible) as counter (counter.id)}
                <span class="chip {counter.id}"><b>{counter.value}</b> {counter.short}</span>
              {/each}
              {#each side.opponentCounters.filter((counter) => counter.visible) as counter (`${counter.id}-${counter.from}`)}
                <span class="chip {counter.id}"><b>{counter.value}</b> {counter.short} {counter.fromName}</span>
              {/each}
            </div>
          </div>
        </section>
        {#if current && cardSlot === side.slot}
          {@render card(current)}
        {/if}
      </div>
    {/each}
  {/if}

  {#if current && !cardInPanel}
    <div class="slot slot-{cardSlot} lone">
      {@render card(current)}
    </div>
  {/if}

  {#if debug}
    <div class="debug">{connected ? "connected" : "disconnected"} | {board ? `${board.format.name}, ${board.sides.length} sides` : "no match live"}</div>
  {/if}
</main>

{#snippet card(shown: OverlayShowMessage)}
  <div class="card" class:visible>
    <div class="flipper" class:flipped={shown.face % 2 === 1}>
      {#each shown.images.slice(0, 2) as src, index (src)}
        <img class="face" class:back={index === 1} {src} alt={shown.card.name} />
      {/each}
    </div>
  </div>
{/snippet}

<style>
  .stage {
    --edge: 2.2vh;
    --panel-width: 34vh;
    position: fixed;
    inset: 0;
    font-family: system-ui, sans-serif;
    color: white;
  }

  .panel {
    position: absolute;
    width: var(--panel-width);
    box-sizing: border-box;
    padding: 1vh 1.6vh 1.2vh;
    border-radius: 1.4vh;
    background: rgb(12 14 20 / 0.82);
    border: 0.25vh solid rgb(255 255 255 / 0.12);
    box-shadow: 0 0.8vh 2.4vh rgb(0 0 0 / 0.45);
    transition:
      border-color 200ms,
      opacity 300ms;
  }
  .panel.active {
    border-color: #f5c84c;
  }
  .panel.out {
    opacity: 0.45;
  }
  .panel.won {
    border-color: #52d273;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.8vh;
    font-size: 2.3vh;
    font-weight: 700;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .turn {
    width: 1.2vh;
    height: 1.2vh;
    border-radius: 50%;
    background: #f5c84c;
    flex: none;
  }
  .wins {
    display: flex;
    gap: 0.5vh;
    flex: none;
  }
  .wins i {
    width: 1.2vh;
    height: 1.2vh;
    border-radius: 50%;
    border: 0.2vh solid rgb(255 255 255 / 0.6);
  }
  .wins i.filled {
    background: #52d273;
    border-color: #52d273;
  }
  .values {
    display: flex;
    align-items: flex-end;
    gap: 1.4vh;
    margin-top: 0.4vh;
  }
  .primary {
    display: flex;
    align-items: baseline;
    gap: 0.6vh;
  }
  .primary .value {
    font-size: 5.6vh;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .primary .label {
    font-size: 1.6vh;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
  .secondary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5vh;
    padding-bottom: 0.4vh;
  }
  .chip {
    font-size: 1.6vh;
    padding: 0.3vh 0.8vh;
    border-radius: 0.8vh;
    background: rgb(255 255 255 / 0.12);
    white-space: nowrap;
  }
  .chip.poison {
    background: rgb(82 210 115 / 0.3);
  }
  .chip.commander {
    background: rgb(229 87 87 / 0.32);
  }

  .slot {
    position: absolute;
    display: flex;
    flex-direction: column;
    gap: var(--edge);
    max-height: calc(100vh - var(--edge) * 2);
  }
  .slot-left,
  .slot-top-left,
  .slot-bottom-left {
    left: var(--edge);
    align-items: flex-start;
  }
  .slot-right,
  .slot-top-right,
  .slot-bottom-right {
    right: var(--edge);
    align-items: flex-end;
  }
  .slot-top,
  .slot-bottom,
  .slot-center {
    left: 50%;
    translate: -50% 0;
    align-items: center;
  }
  .slot-top-left,
  .slot-top,
  .slot-top-right {
    top: var(--edge);
  }
  .slot-left,
  .slot-right,
  .slot-bottom-left,
  .slot-bottom,
  .slot-bottom-right {
    bottom: var(--edge);
    flex-direction: column-reverse;
  }
  .slot.lone.slot-left,
  .slot.lone.slot-right,
  .slot.lone.slot-center {
    top: 50%;
    bottom: auto;
    translate: 0 -50%;
  }
  .slot.lone.slot-center {
    translate: -50% -50%;
  }

  .card {
    position: relative;
    flex: none;
    height: var(--card-height);
    max-height: 100%;
    aspect-ratio: 63 / 88;
    perspective: 2000px;
    opacity: 0;
    transform: scale(0.92);
    transition:
      opacity 250ms ease,
      transform 350ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .card.visible {
    opacity: 1;
    transform: none;
  }
  .flipper {
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    transition: transform 600ms ease;
  }
  .flipper.flipped {
    transform: rotateY(180deg);
  }
  .face {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    backface-visibility: hidden;
    border-radius: 4.5%;
    filter: drop-shadow(0 1.2vh 2.4vh rgb(0 0 0 / 0.55));
  }
  .face.back {
    transform: rotateY(180deg);
  }
  .debug {
    position: fixed;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    color: white;
    background: rgb(0 0 0 / 0.6);
    font: 12px monospace;
    padding: 4px 8px;
  }
</style>
