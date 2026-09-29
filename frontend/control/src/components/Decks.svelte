<script lang="ts">
  import { onMount } from "svelte";
  import type { ParseWarning } from "@cso/shared";
  import { api, type Deck, type DeckSummary } from "../lib/api.ts";
  import { attempt, gameById, live } from "../lib/state.svelte.ts";
  import SearchCards from "./SearchCards.svelte";

  let list = $state<DeckSummary[]>([]);
  let current = $state<Deck | null>(null);
  let editing = $state(false);
  let form = $state({ game: live.games[0]?.id ?? "", name: "", rawText: "" });
  let warnings = $state<ParseWarning[]>([]);
  let saving = $state(false);
  let addSection = $state("tokens");

  async function refresh(): Promise<void> {
    list = (await attempt(() => api.decks())) ?? [];
  }

  onMount(refresh);

  function newDeck(): void {
    current = null;
    editing = true;
    warnings = [];
    form = { game: live.games[0]?.id ?? "", name: "", rawText: "" };
  }

  async function open(id: number): Promise<void> {
    const deck = await attempt(() => api.deck(id));
    if (!deck) return;
    current = deck;
    editing = false;
    warnings = [];
    form = { game: deck.game, name: deck.name, rawText: deck.rawText };
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    saving = true;
    const result = await attempt(() =>
      current ? api.updateDeck(current.id, form.name, form.rawText) : api.createDeck(form.game, form.name, form.rawText),
    );
    saving = false;
    if (!result) return;
    current = result.deck;
    warnings = result.warnings;
    editing = false;
    await refresh();
  }

  async function remove(): Promise<void> {
    if (!current || !confirm(`Delete deck "${current.name}"?`)) return;
    await attempt(() => api.deleteDeck(current!.id));
    current = null;
    await refresh();
  }

  async function reload(): Promise<void> {
    if (!current) return;
    const deck = await attempt(() => api.resolveDeck(current!.id));
    if (deck) current = deck;
  }

  const game = $derived(gameById(current?.game ?? form.game));
  const progress = $derived(current ? live.preload[current.id] : undefined);
  const failed = $derived(current?.entries.filter((entry) => entry.error) ?? []);
  const sections = $derived.by(() => {
    if (!current || !game) return [];
    return game.sections
      .map((section) => ({
        ...section,
        entries: current!.entries.filter((entry) => entry.section === section.id),
      }))
      .filter((section) => section.entries.length);
  });
</script>

<div class="layout">
  <aside class="panel">
    <div class="row" style="justify-content: space-between">
      <h2>Decks</h2>
      <button class="primary" onclick={newDeck}>New</button>
    </div>
    <ul>
      {#each list as deck (deck.id)}
        <li>
          <button class:active={current?.id === deck.id} onclick={() => open(deck.id)}>
            {deck.name} <span class="muted">{deck.game}</span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <section>
    {#if editing}
      <form class="panel editor" onsubmit={save}>
        <h2>{current ? "Edit deck" : "New deck"}</h2>
        <div class="row">
          <select bind:value={form.game} disabled={Boolean(current)}>
            {#each live.games as option (option.id)}
              <option value={option.id}>{option.name}</option>
            {/each}
          </select>
          <input bind:value={form.name} placeholder="Deck name" required style="flex: 1" />
        </div>
        <textarea
          bind:value={form.rawText}
          rows="22"
          placeholder={form.game === "mtg"
            ? "Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring (C21) 263\n..."
            : "Pokemon: 12\n4 Miraidon ex SVI 81\n..."}
        ></textarea>
        <p class="muted">Paste an export from Moxfield, Archidekt, MTG Arena or Pokemon TCG Live. Saving resolves every card.</p>
        <div class="row">
          <button class="primary" disabled={saving}>{saving ? "Resolving cards..." : "Save"}</button>
          <button type="button" onclick={() => (current ? (editing = false) : (current = null))}>Cancel</button>
        </div>
      </form>
    {:else if current}
      <div class="panel">
        <div class="row" style="justify-content: space-between">
          <h2>{current.name} <span class="muted">{game?.name}</span></h2>
          <div class="row">
            <button onclick={() => (editing = true)}>Edit list</button>
            <button onclick={reload}>Re-resolve</button>
            <button onclick={() => attempt(() => api.preloadDeck(current!.id))}>Preload images</button>
            <button class="danger" onclick={remove}>Delete</button>
          </div>
        </div>
        {#if progress}
          <div class="progress">
            <div style="width: {progress.total ? ((progress.done + progress.failed) / progress.total) * 100 : 100}%"></div>
          </div>
          <p class="muted">
            Images: {progress.done}/{progress.total} downloaded{progress.failed ? `, ${progress.failed} failed` : ""}{progress.running ? "..." : ""}
          </p>
        {/if}
        {#each warnings as warning, index (index)}
          <p class="warn">Line {warning.line}: {warning.message} <code>{warning.text}</code></p>
        {/each}
        {#each failed as entry (entry.entryId)}
          <p class="warn">Not found: {entry.name} ({entry.error})</p>
        {/each}
        {#each sections as section (section.id)}
          <h3>{section.name} ({section.entries.reduce((sum, entry) => sum + entry.quantity, 0)})</h3>
          <ul class="entries">
            {#each section.entries as entry (entry.entryId)}
              <li class:missing={!entry.card}>
                {entry.quantity} {entry.card?.name ?? entry.name}
                {#if entry.auto}<span class="muted">(auto)</span>{/if}
                {#if entry.card && !entry.card.cached.every(Boolean)}<span class="muted">(not cached)</span>{/if}
              </li>
            {/each}
          </ul>
        {/each}
      </div>
      {#if game?.canSearch}
        <div class="row" style="margin-top: 16px">
          <span class="muted">Add found cards to section</span>
          <select bind:value={addSection}>
            {#each game.sections as section (section.id)}
              <option value={section.id}>{section.name}</option>
            {/each}
          </select>
        </div>
        <SearchCards
          gameId={current.game}
          actionLabel="Add to deck"
          onaction={async (card) => {
            const deck = await attempt(() => api.addCard(current!.id, card.key, addSection));
            if (deck) current = deck;
          }}
        />
      {/if}
    {:else}
      <p class="muted">Select a deck or create a new one.</p>
    {/if}
  </section>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 16px;
    align-items: start;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  aside li button {
    width: 100%;
    text-align: left;
    border-color: transparent;
    background: transparent;
  }
  aside li button.active {
    border-color: var(--accent);
  }
  .editor {
    display: grid;
    gap: 12px;
  }
  h3 {
    font-size: 14px;
    margin: 16px 0 4px;
  }
  .entries {
    columns: 3 220px;
    font-size: 13px;
  }
  .missing {
    color: var(--err);
  }
  .warn {
    color: var(--warn);
    margin: 4px 0;
  }
  .progress {
    height: 6px;
    background: var(--line);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 8px;
  }
  .progress div {
    height: 100%;
    background: var(--ok);
    transition: width 200ms;
  }
</style>
