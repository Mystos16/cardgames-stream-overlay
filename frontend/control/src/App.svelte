<script lang="ts">
  import { onMount } from "svelte";
  import { ApiError, initToken, setToken } from "./lib/api.ts";
  import { attempt, live, loadGames, startLive } from "./lib/state.svelte.ts";
  import Live from "./components/Live.svelte";
  import Decks from "./components/Decks.svelte";
  import Matches from "./components/Matches.svelte";
  import Settings from "./components/Settings.svelte";

  type Tab = "live" | "matches" | "decks" | "settings";
  let tab = $state<Tab>("live");
  let needsToken = $state(false);
  let tokenInput = $state("");
  let ready = $state(false);

  initToken();

  async function boot(): Promise<void> {
    try {
      await loadGames();
      needsToken = false;
      ready = true;
      startLive();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) needsToken = true;
      else live.error = String(error);
    }
  }

  onMount(boot);

  function saveToken(event: SubmitEvent): void {
    event.preventDefault();
    setToken(tokenInput.trim());
    void attempt(boot);
  }
</script>

{#if needsToken}
  <form class="login panel" onsubmit={saveToken}>
    <h2>Control token</h2>
    <p class="muted">This server requires the control token.</p>
    <input type="password" bind:value={tokenInput} placeholder="CONTROL_TOKEN" />
    <button class="primary">Continue</button>
  </form>
{:else if ready}
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
  .login {
    max-width: 360px;
    margin: 15vh auto;
    display: grid;
    gap: 12px;
  }
</style>
