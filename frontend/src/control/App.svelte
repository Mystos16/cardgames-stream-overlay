<script lang="ts">
  import { onMount } from "svelte";
  import { live, loadGames, startLive } from "../lib/state.svelte.ts";
  import Live from "./components/Live.svelte";
  import Decks from "./components/Decks.svelte";
  import Matches from "./components/Matches.svelte";
  import Settings from "./components/Settings.svelte";

  type Tab = "live" | "matches" | "decks" | "settings";
  let tab = $state<Tab>("live");
  let ready = $state(false);

  async function boot(): Promise<void> {
    try {
      await loadGames();
      ready = true;
      startLive();
    } catch (error) {
      live.error = String(error);
    }
  }

  onMount(boot);
</script>

{#if ready}
  <header>
    <strong>Card overlay</strong>
    <nav>
      {#each [["live", "Live"], ["matches", "Matches"], ["decks", "Deck library"], ["settings", "Settings"]] as [id, label] (id)}
        <button class:active={tab === id} onclick={() => (tab = id as Tab)}>{label}</button>
      {/each}
    </nav>
    <span class="status" class:ok={live.connected}>{live.connected ? "connected" : "reconnecting"}</span>
  </header>
  {#if live.error}
    <div class="error" role="alert">
      {live.error}
      <button onclick={() => (live.error = "")}>dismiss</button>
    </div>
  {/if}
  <main>
    {#if tab === "live"}
      <Live />
    {:else if tab === "matches"}
      <Matches onopen={() => (tab = "live")} />
    {:else if tab === "decks"}
      <Decks />
    {:else}
      <Settings />
    {/if}
  </main>
{:else}
  <p class="muted" style="padding: 24px">Loading...{live.error ? ` ${live.error}` : ""}</p>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    position: sticky;
    top: 0;
    z-index: 5;
  }
  nav {
    display: flex;
    gap: 4px;
    flex: 1;
  }
  nav button {
    border-color: transparent;
    background: transparent;
  }
  nav button.active {
    border-color: var(--accent);
  }
  .status {
    color: var(--warn);
    font-size: 12px;
  }
  .status.ok {
    color: var(--ok);
  }
  main {
    padding: 16px;
  }
  .error {
    margin: 12px 16px 0;
    padding: 8px 12px;
    border: 1px solid var(--err);
    border-radius: 6px;
    color: var(--err);
    display: flex;
    justify-content: space-between;
  }
</style>
