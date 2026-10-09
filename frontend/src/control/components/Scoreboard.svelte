<script lang="ts">
  import type { Board, FormatDef, MatchAction } from "@cso/shared";
  import { api } from "../../lib/api.ts";
  import { attempt, live } from "../../lib/state.svelte.ts";

  let { matchId, format, initial }: { matchId: number; format: FormatDef; initial: Board } = $props();

  let local = $state<Board | null>(null);
  let focused = $state(0);
  const board = $derived(live.board?.matchId === matchId ? live.board : (local ?? initial));
  const primary = $derived(format.counters.find((counter) => counter.primary)!);
  const others = $derived(format.counters.filter((counter) => !counter.primary));
  const live_ = $derived(live.board?.matchId === matchId);

  async function act(action: MatchAction): Promise<void> {
    const result = await attempt(() => api.matchAction(matchId, action));
    if (result) local = result.board;
  }

  function value(side: number, counter: string): number {
    return board.sides[side]?.counters.find((item) => item.id === counter)?.value ?? 0;
  }

  function opponentValue(side: number, from: number, counter: string): number {
    return board.sides[side]?.opponentCounters.find((item) => item.id === counter && item.from === from)?.value ?? 0;
  }

  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
    const digit = Number(event.key);
    if (event.altKey && digit >= 1 && digit <= board.sides.length) {
      event.preventDefault();
      focused = digit - 1;
      return;
    }
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      void act({ type: "counter", side: focused, counter: primary.id, delta: step });
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      void act({ type: "counter", side: focused, counter: primary.id, delta: -step });
    } else if (event.key === "t" && format.turns) {
      void act({ type: "turn", side: "next" });
    } else if (event.key.toLowerCase() === "p" && others.some((counter) => counter.id === "poison")) {
      void act({ type: "counter", side: focused, counter: "poison", delta: event.shiftKey ? -1 : 1 });
    }
  }

  const SLOT_ORDER = ["top-left", "top", "top-right", "left", "right", "bottom-left", "bottom", "bottom-right"];
  const ordered = $derived([...board.sides].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)));
  const columns = $derived(board.sides.length <= 2 ? board.sides.length : board.sides.length === 4 ? 2 : 3);
</script>

<svelte:window onkeydown={onKey} />

<section class="board">
  <div class="row bar">
    <strong>{board.format.name}</strong>
    <span class="muted">Game {board.gameNumber}</span>
    <label class="row">
      <span class="muted">Best of</span>
      <select value={board.bestOf} onchange={(event) => act({ type: "bestOf", value: Number(event.currentTarget.value) })}>
        {#each [1, 3, 5, 7] as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    </label>
    {#if format.turns}
      <button onclick={() => act({ type: "turn", side: "next" })}>Next turn (T)</button>
    {/if}
    <span class="spacer"></span>
    {#if live_}
      <label class="row">
        <input type="checkbox" checked={board.visible} onchange={(event) => act({ type: "visible", value: event.currentTarget.checked })} />
        <span>Show on stream</span>
      </label>
    {:else}
      <button class="primary" onclick={async () => (local = (await attempt(() => api.activateMatch(matchId))) ?? local)}>Put this match on stream</button>
    {/if}
    <button onclick={() => confirm("Start the next game? Life and counters reset, the score is kept.") && act({ type: "newGame" })}>Next game</button>
    <button class="danger" onclick={() => confirm("Reset the whole match, including the score?") && act({ type: "resetMatch" })}>Reset match</button>
  </div>

  <div class="sides" style="grid-template-columns: repeat({columns}, 1fr)">
    {#each ordered as side (side.index)}
      <div
        class="side panel"
        class:focused={focused === side.index}
        class:active={side.active}
        class:out={side.status === "out"}
        class:won={side.status === "won"}
        onpointerdown={() => (focused = side.index)}
        role="group"
        aria-label={side.name}
      >
        <div class="row head">
          <span class="key">Alt+{side.index + 1}</span>
          <strong class="name">{side.name}</strong>
          {#if side.status !== "alive"}<span class="badge">{side.status === "won" ? "won" : "out"}</span>{/if}
          {#if format.turns}
            <button class="small" class:on={side.active} onclick={() => act({ type: "turn", side: side.index })}>Turn</button>
          {/if}
          {#if board.bestOf > 1}
            <span class="row wins">
              <button class="small" onclick={() => act({ type: "win", side: side.index, delta: -1 })}>-</button>
              <span>{side.wins} {side.wins === 1 ? "win" : "wins"}</span>
              <button class="small" onclick={() => act({ type: "win", side: side.index, delta: 1 })}>+</button>
            </span>
          {/if}
        </div>

        <div class="row main">
          <button onclick={() => act({ type: "counter", side: side.index, counter: primary.id, delta: -5 })}>-5</button>
          <button onclick={() => act({ type: "counter", side: side.index, counter: primary.id, delta: -1 })}>-1</button>
          <span class="big">{value(side.index, primary.id)}<small>{primary.short}</small></span>
          <button onclick={() => act({ type: "counter", side: side.index, counter: primary.id, delta: 1 })}>+1</button>
          <button onclick={() => act({ type: "counter", side: side.index, counter: primary.id, delta: 5 })}>+5</button>
        </div>

        {#each others as counter (counter.id)}
          <div class="row line">
            <span class="label">{counter.name}</span>
            <button class="small" onclick={() => act({ type: "counter", side: side.index, counter: counter.id, delta: -1 })}>-</button>
            <span class="num">{value(side.index, counter.id)}</span>
            <button class="small" onclick={() => act({ type: "counter", side: side.index, counter: counter.id, delta: 1 })}>+</button>
          </div>
        {/each}

        {#each format.opponentCounters ?? [] as counter (counter.id)}
          <div class="opp">
            <span class="label">{counter.name} taken from</span>
            {#each board.sides.filter((other) => other.index !== side.index) as other (other.index)}
              <div class="row line">
                <span class="from">{other.name}</span>
                <button class="small" onclick={() => act({ type: "opponentCounter", side: side.index, from: other.index, counter: counter.id, delta: -1 })}>-</button>
                <span class="num" class:lethal={counter.lethal !== undefined && opponentValue(side.index, other.index, counter.id) >= counter.lethal}
                  >{opponentValue(side.index, other.index, counter.id)}</span
                >
                <button class="small" onclick={() => act({ type: "opponentCounter", side: side.index, from: other.index, counter: counter.id, delta: 1 })}>+</button>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <p class="muted hint">
    Click a player or press Alt+1..{board.sides.length} to select. + / - changes {primary.name.toLowerCase()} (Shift for 5){others.some((c) => c.id === "poison") ? ", P / Shift+P poison" : ""}{format.turns ? ", T next turn" : ""}.
  </p>
</section>

<style>
  .board {
    margin-bottom: 16px;
  }
  .bar {
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .sides {
    display: grid;
    gap: 8px;
  }
  .side {
    display: grid;
    gap: 6px;
    cursor: pointer;
    border: 2px solid transparent;
  }
  .side.focused {
    border-color: var(--accent);
  }
  .side.active .name::before {
    content: "\25CF  ";
    color: #f5c84c;
  }
  .side.out {
    opacity: 0.55;
  }
  .side.won .badge {
    background: #2f8f4e;
  }
  .badge {
    background: #8f2f2f;
    color: white;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 12px;
  }
  .head .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .key {
    font-size: 11px;
    opacity: 0.6;
  }
  .main {
    justify-content: center;
  }
  .big {
    font-size: 34px;
    font-weight: 800;
    min-width: 90px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .big small {
    font-size: 12px;
    font-weight: 400;
    opacity: 0.6;
    margin-left: 4px;
  }
  .line .label,
  .line .from {
    flex: 1;
  }
  .opp > .label {
    font-size: 12px;
    opacity: 0.7;
  }
  .num {
    min-width: 28px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .num.lethal {
    color: #ff6b6b;
    font-weight: 700;
  }
  button.small {
    padding: 2px 8px;
  }
  button.on {
    border-color: #f5c84c;
  }
  .hint {
    font-size: 12px;
    margin: 6px 0 0;
  }
</style>
