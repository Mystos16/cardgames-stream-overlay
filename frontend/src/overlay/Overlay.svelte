<script lang="ts">
  import type { OverlayMessage, OverlayShowMessage } from "@cso/shared";

  const params = new URLSearchParams(location.search);
  const position = params.get("position") ?? "right";
  const cardHeight = Math.min(100, Math.max(10, Number(params.get("cardHeight") ?? 70)));
  const debug = params.has("debug");

  let current = $state<OverlayShowMessage | null>(null);
  let visible = $state(false);
  let connected = $state(false);

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
      const next = message;
      await preload(next.images);
      if (current && visible && current.id !== next.id) {
        visible = false;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      current = next;
      visible = true;
    } else if (message.type === "flip" && current) {
      current = { ...current, face: message.face };
    } else if (message.type === "hide") {
      visible = false;
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
</script>

<main class="stage {position}" style="--card-height: {cardHeight}vh">
  {#if current}
    <div class="card" class:visible>
      <div class="flipper" class:flipped={current.face % 2 === 1}>
        {#each current.images.slice(0, 2) as src, index (src)}
          <img class="face" class:back={index === 1} {src} alt={current.card.name} />
        {/each}
      </div>
      {#if current.playerName}
        <div class="label">{current.playerName}</div>
      {/if}
    </div>
  {/if}
  {#if debug}
    <div class="debug">{connected ? "connected" : "disconnected"}</div>
  {/if}
</main>

<style>
  .stage {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 4vw;
    box-sizing: border-box;
  }
  .left {
    justify-content: flex-start;
  }
  .center {
    justify-content: center;
  }
  .right {
    justify-content: flex-end;
  }
  .card {
    height: var(--card-height);
    aspect-ratio: 63 / 88;
    position: relative;
    perspective: 2000px;
    opacity: 0;
    transform: translateY(6vh) scale(0.92);
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
  .label {
    position: absolute;
    left: 50%;
    bottom: -5vh;
    transform: translateX(-50%);
    padding: 0.6vh 1.6vh;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.7);
    color: white;
    font: 600 2.2vh system-ui, sans-serif;
    white-space: nowrap;
  }
  .debug {
    position: fixed;
    top: 8px;
    left: 8px;
    color: white;
    background: rgb(0 0 0 / 0.6);
    font: 12px monospace;
    padding: 4px 8px;
  }
</style>
