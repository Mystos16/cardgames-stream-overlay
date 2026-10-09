<script lang="ts">
  import { onMount } from "svelte";
  import type { FormatDef } from "@cso/shared";
  import { api, type DeckSummary, type MatchSummary } from "../../lib/api.ts";
  import { attempt, gameById, live } from "../../lib/state.svelte.ts";

  let { onopen }: { onopen: () => void } = $props();

  interface Editing {
    id: number | null;
    game: string;
    format: string;
    name: string;
    players: { playerName: string; deckId: number | null }[];
  }

  let list = $state<MatchSummary[]>([]);
  let decks = $state<DeckSummary[]>([]);
  let editing = $state<Editing | null>(null);

  async function refresh(): Promise<void> {
    list = (await attempt(() => api.matches())) ?? [];
    decks = (await attempt(() => api.decks())) ?? [];
  }

  onMount(refresh);

  function seats(count: number, existing: Editing["players"] = []): Editing["players"] {
    return Array.from({ length: count }, (_, index) => existing[index] ?? { playerName: `Player ${index + 1}`, deckId: null });
  }

  function formatsOf(game: string): FormatDef[] {
    return gameById(game)?.formats ?? [];
  }

  function newMatch(): void {
    const game = live.games[0]?.id ?? "";
    const format = formatsOf(game)[0];
    editing = { id: null, game, format: format?.id ?? "", name: "", players: seats(format?.defaultPlayers ?? 2) };
  }

  function changeGame(): void {
    if (!editing) return;
    const format = formatsOf(editing.game)[0];
    editing.format = format?.id ?? "";
    editing.players = seats(format?.defaultPlayers ?? 2).map((player) => ({ ...player, deckId: null }));
  }

  function changeFormat(): void {
    if (!editing || !format) return;
    const count = Math.min(format.maxPlayers, Math.max(format.minPlayers, editing.id ? editing.players.length : format.defaultPlayers));
    editing.players = seats(count, editing.players);
  }

  async function edit(id: number): Promise<void> {
    const match = await attempt(() => api.match(id));
    if (!match) return;
    editing = {
      id: match.id,
      game: match.game,
      format: match.format,
      name: match.name,
      players: match.players.map((player) => ({ playerName: player.playerName, deckId: player.deckId })),
    };
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!editing) return;
    const value = editing;
    const saved = await attempt(() =>
      value.id
        ? api.updateMatch(value.id, value.name, value.format, value.players)
        : api.createMatch(value.game, value.name, value.format, value.players),
    );
    if (!saved) return;
    await attempt(() => api.preloadMatch(saved.id));
    editing = null;
    await refresh();
  }

  async function remove(match: MatchSummary): Promise<void> {
    if (!confirm(`Delete match "${match.name}"?`)) return;
    await attempt(() => api.deleteMatch(match.id));
    await refresh();
  }

  function goLive(id: number): void {
    localStorage.setItem("cso-match", String(id));
    onopen();
  }

  const format = $derived(editing ? formatsOf(editing.game).find((item) => item.id === editing!.format) : undefined);
  const step = $derived(format?.teamSize ?? 1);
  const formatName = (game: string, id: string | null) => formatsOf(game).find((item) => item.id === id)?.name ?? formatsOf(game)[0]?.name ?? "";
  const gameDecks = $derived(editing ? decks.filter((deck) => deck.game === editing!.game) : []);
</script>

<div class="row" style="justify-content: space-between; margin-bottom: 12px">
  <h2>Matches</h2>
  <button class="primary" onclick={newMatch}>New match</button>
</div>

{#if editing}
  <form class="panel editor" onsubmit={save}>
    <div class="row">
      <select bind:value={editing.game} disabled={Boolean(editing.id)} onchange={changeGame}>
        {#each live.games as game (game.id)}
          <option value={game.id}>{game.name}</option>
        {/each}
      </select>
      <select bind:value={editing.format} onchange={changeFormat}>
        {#each formatsOf(editing.game) as item (item.id)}
          <option value={item.id}>{item.name}</option>
        {/each}
      </select>
      <input bind:value={editing.name} placeholder="Match name, e.g. Round 3 table 1" required style="flex: 1" />
    </div>
    {#each editing.players as player, index (index)}
      <div class="row">
        <span class="muted">{step > 1 ? `Team ${Math.floor(index / step) + 1}` : `Seat ${index + 1}`}</span>
        <input bind:value={player.playerName} placeholder="Player name" required />
        <select bind:value={player.deckId}>
          <option value={null}>(no deck)</option>
          {#each gameDecks as deck (deck.id)}
            <option value={deck.id}>{deck.name}</option>
          {/each}
        </select>
        <button type="button" onclick={() => editing!.players.splice(index, 1)} disabled={step > 1 || editing.players.length <= (format?.minPlayers ?? 1)}
          >Remove</button
        >
      </div>
    {/each}
    <div class="row">
      <button
        type="button"
        onclick={() => (editing!.players = seats(editing!.players.length + step, editing!.players))}
        disabled={!format || editing.players.length + step > format.maxPlayers}>{step > 1 ? "Add team" : "Add player"}</button
      >
      {#if format}<span class="muted">{format.minPlayers === format.maxPlayers ? format.minPlayers : `${format.minPlayers}-${format.maxPlayers}`} players</span>{/if}
    </div>
    <div class="row">
      <button class="primary">Save and preload</button>
      <button type="button" onclick={() => (editing = null)}>Cancel</button>
    </div>
  </form>
{/if}

<table>
  <thead><tr><th>Name</th><th>Game</th><th>Format</th><th></th></tr></thead>
  <tbody>
    {#each list as match (match.id)}
      <tr>
        <td>{match.name}</td>
        <td>{gameById(match.game)?.name ?? match.game}</td>
        <td>{formatName(match.game, match.format)}</td>
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
