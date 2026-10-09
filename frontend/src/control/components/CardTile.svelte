<script lang="ts">
  import type { DeckEntryView } from "../../lib/api.ts";

  let { entry, active = false, focused = false, onshow }: { entry: DeckEntryView; active?: boolean; focused?: boolean; onshow: () => void } =
    $props();

  const card = $derived(entry.card!);
  const cached = $derived(card.cached.every(Boolean));
  const thumb = $derived(card.faces[0]?.imageUrl ?? "");
</script>

<button class="tile" class:active class:focused onclick={onshow} title={card.name}>
  <img src={thumb} alt={card.name} loading="lazy" referrerpolicy="no-referrer" />
  <span class="name">
    {#if entry.quantity > 1}<b>{entry.quantity}x</b>{/if}
    {card.name}
  </span>
  <span class="dot" class:cached title={cached ? "image cached" : "not cached yet"}></span>
</button>

<style>
  .tile {
    position: relative;
    display: grid;
    gap: 4px;
    padding: 4px;
    text-align: left;
  }
  .tile img {
    width: 100%;
    aspect-ratio: 63 / 88;
    object-fit: cover;
    border-radius: 5px;
    background: #000;
  }
  .tile.active {
    border-color: var(--ok);
    box-shadow: 0 0 0 2px var(--ok);
  }
  .tile.focused {
    border-color: var(--accent);
  }
  .name {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--warn);
  }
  .dot.cached {
    background: var(--ok);
  }
</style>
