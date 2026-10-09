<script lang="ts">
  import { onMount } from "svelte";
  import { api, type DeckSummary, type Match } from "../../lib/api.ts";
  import { attempt, gameById, live } from "../../lib/state.svelte.ts";

  let { onopen }: { onopen: () => void } = $props();

  let list = $state<Match[]>([]);
  let decks = $state<DeckSummary[]>([]);
  let editing = $state<{ id: number | null; game: string; name: string; players: { playerName: string; deckId: number | null }[] } | null>(null);

  async function refresh(): Promise<void> {
    list = (await attempt(() => api.matches())) ?? [];
    decks = (await attempt(() => api.decks())) ?? [];
  }

  onMount(refresh);

  function newMatch(): void {
    const game = live.games[0]?.id ?? "";
    editing = {
      id: null,
      game,
      name: "",
      players: [
        { playerName: "Player 1", deckId: null },
        { playerName: "Player 2", deckId: null },
      ],
    };
  }

  async function edit(id: number): Promise<void> {
    const match = await attempt(() => api.match(id));
    if (!match) return;
    editing = {
      id: match.id,
      game: match.game,
      name: match.name,
      players: match.players.map((player) => ({ playerName: player.playerName, deckId: player.deckId })),
    };
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!editing) return;
    const value = editing;
    const saved = await attempt(() =>
      value.id ? api.updateMatch(value.id, value.name, value.players) : api.createMatch(value.game, value.name, value.players),
    );
    if (!saved) return;
    await attempt(() => api.preloadMatch(saved.id));
    editing = null;
    await refresh();
  }

  async function remove(match: Match): Promise<void> {
    if (!confirm(`Delete match "${match.name}"?`)) return;
    await attempt(() => api.deleteMatch(match.id));
    await refresh();
  }

  function goLive(id: number): void {
    localStorage.setItem("cso-match", String(id));
    onopen();
  }

  const rules = $derived(editing ? gameById(editing.game)?.deckRules : undefined);
  const gameDecks = $derived(editing ? decks.filter((deck) => deck.game === editing!.game) : []);
</script>

<div class="row" style="justify-content: space-between; margin-bottom: 12px">
  <h2>Matches</h2>
  <button class="primary" onclick={newMatch}>New match</button>
</div>

{#if editing}
  <form class="panel editor" onsubmit={save}>
    <div class="row">
      <select bind:value={editing.game} disabled={Boolean(editing.id)}>
        {#each live.games as game (game.id)}
          <option value={game.id}>{game.name}</option>
        {/each}
      </select>
      <input bind:value={editing.name} placeholder="Match name, e.g. Round 3 table 1" required style="flex: 1" />
    </div>
    {#each editing.players as player, index (index)}
      <div class="row">
        <span class="muted">Seat {index + 1}</span>
        <input bind:value={player.playerName} placeholder="Player name" required />
        <select bind:value={player.deckId}>
          <option value={null}>(no deck)</option>
          {#each gameDecks as deck (deck.id)}
            <option value={deck.id}>{deck.name}</option>
          {/each}
        </select>
        <button type="button" onclick={() => editing!.players.splice(index, 1)} disabled={editing.players.length <= 1}>Remove</button>
      </div>
    {/each}
    <div class="row">
      <button
        type="button"
        onclick={() => editing!.players.push({ playerName: `Player ${editing!.players.length + 1}`, deckId: null })}
        disabled={rules?.maxPlayers !== undefined && editing.players.length >= rules.maxPlayers}>Add player</button
      >
      {#if rules?.maxPlayers}<span class="muted">{rules.minPlayers ?? 1}-{rules.maxPlayers} players</span>{/if}
    </div>
    <div class="row">
      <button class="primary">Save and preload</button>
      <button type="button" onclick={() => (editing = null)}>Cancel</button>
    </div>
  </form>
{/if}

<table>
  <thead><tr><th>Name</th><th>Game</th><th></th></tr></thead>
  <tbody>
    {#each list as match (match.id)}
      <tr>
        <td>{match.name}</td>
        <td>{gameById(match.game)?.name ?? match.game}</td>
        <td class="row">
          <button class="primary" onclick={() => goLive(match.id)}>Go live</button>
          <button onclick={() => edit(match.id)}>Edit</button>
          <button onclick={() => attempt(() => api.preloadMatch(match.id))}>Preload</button>
          <button class="danger" onclick={() => remove(match)}>Delete</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .editor {
    display: grid;
    gap: 10px;
    margin-bottom: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 8px;
    border-bottom: 1px solid var(--line);
  }
</style>
