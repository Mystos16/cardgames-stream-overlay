<script lang="ts">
  import type { Card } from "@cso/shared";
  import { api } from "../../lib/api.ts";
  import { attempt } from "../../lib/state.svelte.ts";

  let { gameId, onshow, actionLabel = "Show", onaction }: { gameId: string; onshow?: (card: Card) => void; actionLabel?: string; onaction?: (card: Card) => void } =
    $props();

  let query = $state("");
  let results = $state<Card[]>([]);
  let busy = $state(false);

  async function search(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!query.trim()) return;
    busy = true;
    results = (await attempt(() => api.search(gameId, query.trim()))) ?? [];
    busy = false;
  }
</script>

<section class="panel">
  <h3>Search cards not in any deck</h3>
  <form class="row" onsubmit={search}>
    <input bind:value={query} placeholder={gameId === "mtg" ? "Scryfall syntax, e.g. t:token name:treasure" : "Card name"} />
    <button disabled={busy}>{busy ? "Searching..." : "Search"}</button>
  </form>
  <div class="grid">
    {#each results as card (card.key)}
      <div class="result">
        <img src={card.faces[0]?.imageUrl} alt={card.name} loading="lazy" referrerpolicy="no-referrer" />
        <span>{card.name}</span>
        <div class="row">
          {#if onshow}<button onclick={() => onshow(card)}>Show</button>{/if}
          {#if onaction}<button onclick={() => onaction(card)}>{actionLabel}</button>{/if}
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    margin-top: 24px;
  }
  h3 {
    font-size: 14px;
    margin: 0 0 8px;
  }
  form input {
    flex: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }
  .result {
    display: grid;
    gap: 4px;
    font-size: 12px;
  }
  .result img {
    width: 100%;
    aspect-ratio: 63 / 88;
    object-fit: cover;
    border-radius: 5px;
  }
</style>
