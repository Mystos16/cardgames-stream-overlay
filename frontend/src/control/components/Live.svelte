<script lang="ts">
  import { onMount } from "svelte";
  import { api, type Deck, type DeckEntryView, type Match } from "../../lib/api.ts";
  import { attempt, gameById, live } from "../../lib/state.svelte.ts";
  import CardTile from "./CardTile.svelte";
  import SearchCards from "./SearchCards.svelte";

  let matches = $state<Match[]>([]);
  let matchId = $state<number | null>(Number(localStorage.getItem("cso-match")) || null);
  let match = $state<Match | null>(null);
  let decks = $state<Record<number, Deck>>({});
  let seat = $state<number | "all">("all");
  let filter = $state("");
  let selected = $state(0);
  let searchInput: HTMLInputElement | undefined = $state();

  interface Item {
    entry: DeckEntryView;
    playerName: string;
    seat: number;
  }

  onMount(() => {
    void attempt(async () => {
      matches = await api.matches();
      if (!matchId && matches[0]) matchId = matches[0].id;
    });
  });

  $effect(() => {
    if (matchId === null) return;
    localStorage.setItem("cso-match", String(matchId));
    const id = matchId;
    void attempt(async () => {
      const loaded = await api.match(id);
      const loadedDecks: Record<number, Deck> = {};
      for (const player of loaded.players) if (player.deckId !== null) loadedDecks[player.deckId] = await api.deck(player.deckId);
      match = loaded;
      decks = loadedDecks;
    });
  });

  $effect(() => {
    void live.imageVersion;
    const running = Object.values(live.preload).some((progress) => progress.running);
    if (!running && match) {
      const ids = match.players.map((player) => player.deckId).filter((id): id is number => id !== null);
      const timer = setTimeout(() => {
        void Promise.all(ids.map((id) => api.deck(id))).then((list) => {
          decks = Object.fromEntries(list.map((deck) => [deck.id, deck]));
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  });

  const game = $derived(match ? gameById(match.game) : undefined);

  const items = $derived.by((): Item[] => {
    if (!match) return [];
    const needle = filter.trim().toLowerCase();
    const list: Item[] = [];
    for (const player of match.players) {
      if (seat !== "all" && seat !== player.seat) continue;
      const deck = player.deckId !== null ? decks[player.deckId] : undefined;
      for (const entry of deck?.entries ?? []) {
        if (!entry.card) continue;
        if (needle) {
          const typeLine = String(entry.card.meta?.typeLine ?? "").toLowerCase();
          if (!entry.card.name.toLowerCase().includes(needle) && !typeLine.includes(needle)) continue;
        }
        list.push({ entry, playerName: player.playerName, seat: player.seat });
      }
    }
    return list;
  });

  const grouped = $derived.by(() => {
    const order = game?.sections.map((section) => section.id) ?? [];
    const groups = new Map<string, Item[]>();
    for (const item of items) {
      const key = seat === "all" && match && match.players.length > 1 ? `${item.seat}|${item.entry.section}` : `|${item.entry.section}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => {
        const [seatA, sectionA] = a.split("|");
        const [seatB, sectionB] = b.split("|");
        return Number(seatA) - Number(seatB) || order.indexOf(sectionA!) - order.indexOf(sectionB!);
      })
      .map(([key, list]) => {
        const [seatKey, section] = key.split("|");
        const player = match?.players.find((candidate) => String(candidate.seat) === seatKey);
        const sectionName = game?.sections.find((candidate) => candidate.id === section)?.name ?? section;
        return { key, title: player ? `${player.playerName}: ${sectionName}` : sectionName, items: list };
      });
  });

  const flat = $derived(grouped.flatMap((group) => group.items));

  $effect(() => {
    void filter;
    void seat;
    selected = 0;
  });

  function show(item: Item): void {
    void attempt(() => api.show(item.entry.card!.key, item.playerName));
  }

  function onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if (event.key === "/" && !typing) {
      event.preventDefault();
      searchInput?.focus();
    } else if (event.key === "Escape") {
      void attempt(() => api.hide());
      if (target === searchInput) filter = "";
    } else if (event.key === "Enter" && (target === searchInput || !typing)) {
      const item = flat[selected];
      if (item) show(item);
    } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && target === searchInput) {
      event.preventDefault();
      selected = Math.max(0, Math.min(flat.length - 1, selected + (event.key === "ArrowDown" ? 1 : -1)));
    } else if (event.key === "f" && !typing) {
      void attempt(() => api.flip());
    }
  }

  const showing = $derived(live.overlay?.type === "show" ? live.overlay : null);
</script>

<svelte:window onkeydown={onKey} />

<div class="toolbar row">
  <select bind:value={matchId}>
    {#each matches as item (item.id)}
      <option value={item.id}>{item.name} ({item.game})</option>
    {/each}
  </select>
  {#if match}
    <div class="tabs row">
      <button class:active={seat === "all"} onclick={() => (seat = "all")}>All players</button>
      {#each match.players as player (player.seat)}
        <button class:active={seat === player.seat} onclick={() => (seat = player.seat)}>{player.playerName}</button>
      {/each}
    </div>
  {/if}
  <input
    class="search"
    bind:this={searchInput}
    bind:value={filter}
    placeholder="Filter cards  ( / to focus, Enter to show, Esc to hide, F to flip )"
  />
</div>

<div class="nowbar row">
  <span class="muted">On stream:</span>
  <strong>{showing ? showing.card.name : "nothing"}</strong>
  {#if showing && showing.images.length > 1}
    <button onclick={() => attempt(() => api.flip())}>Flip</button>
  {/if}
  <button class="danger" disabled={!showing} onclick={() => attempt(() => api.hide())}>Hide (Esc)</button>
</div>

{#if !match}
  <p class="muted">No match yet. Create one under Matches.</p>
{:else}
  {#each grouped as group (group.key)}
    <section>
      <h3>{group.title} <span class="muted">({group.items.reduce((sum, item) => sum + item.entry.quantity, 0)})</span></h3>
      <div class="grid">
        {#each group.items as item (item.entry.entryId)}
          <CardTile
            entry={item.entry}
            active={showing?.card.key === item.entry.card?.key}
            focused={flat[selected] === item}
            onshow={() => show(item)}
          />
        {/each}
      </div>
    </section>
  {/each}
  {#if game?.canSearch}
    <SearchCards gameId={match.game} onshow={(card) => attempt(() => api.show(card.key))} />
  {/if}
{/if}

<style>
  .toolbar {
    margin-bottom: 12px;
  }
  .tabs button.active {
    border-color: var(--accent);
  }
  .search {
    flex: 1;
    min-width: 260px;
  }
  .nowbar {
    margin-bottom: 16px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  h3 {
    font-size: 14px;
    margin: 18px 0 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 8px;
  }
</style>
