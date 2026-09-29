<script lang="ts">
  import { onMount } from "svelte";
  import type { SettingsValues } from "@cso/shared";
  import { api, type ConnectorInfo, type SettingsScope } from "../lib/api.ts";
  import { attempt, live } from "../lib/state.svelte.ts";

  let scopes = $state<SettingsScope[]>([]);
  let cache = $state<{ bytes: number; files: number } | null>(null);
  let connectors = $state<ConnectorInfo[]>([]);
  let saved = $state("");

  async function refresh(): Promise<void> {
    scopes = (await attempt(() => api.settings())) ?? [];
    cache = (await attempt(() => api.cache())) ?? null;
    connectors = (await attempt(() => api.connectors())) ?? [];
  }

  onMount(refresh);

  function title(scope: string): string {
    if (scope === "core") return "General";
    const [kind, id] = scope.split(":");
    if (kind === "game") return live.games.find((game) => game.id === id)?.name ?? id!;
    return connectors.find((connector) => connector.id === id)?.name ?? id!;
  }

  async function save(scope: SettingsScope): Promise<void> {
    const values = await attempt(() => api.saveSettings(scope.scope, scope.values as SettingsValues));
    if (!values) return;
    scope.values = values;
    saved = scope.scope;
    setTimeout(() => (saved = ""), 1500);
    connectors = (await attempt(() => api.connectors())) ?? connectors;
  }

  async function clearCache(): Promise<void> {
    if (!confirm("Delete all cached card images? Prepared matches will need to preload again.")) return;
    await attempt(() => api.clearCache());
    cache = (await attempt(() => api.cache())) ?? null;
  }

  function size(bytes: number): string {
    if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
</script>

<div class="stack">
  {#each connectors as connector (connector.id)}
    {#if connector.info.browserSource}
      <section class="panel">
        <h2>{connector.name}</h2>
        <ol>
          {#each connector.info.browserSource.steps as step, index (index)}<li>{step}</li>{/each}
        </ol>
        <div class="row">
          <input readonly value={connector.info.browserSource.url} style="flex: 1" onfocus={(event) => event.currentTarget.select()} />
          <button onclick={() => navigator.clipboard.writeText(connector.info.browserSource!.url)}>Copy</button>
        </div>
        <p class="muted">
          Size {connector.info.browserSource.width} x {connector.info.browserSource.height}. Status: {connector.status.state}
          {connector.status.message ? `(${connector.status.message})` : ""}
        </p>
      </section>
    {/if}
  {/each}

  {#each scopes as scope (scope.scope)}
    <section class="panel">
      <h2>{title(scope.scope)}</h2>
      {#each scope.schema.fields as field (field.key)}
        <label class="field">
          <span>{field.label}</span>
          {#if field.type === "boolean"}
            <input type="checkbox" bind:checked={scope.values[field.key] as boolean} />
          {:else if field.type === "select"}
            <select bind:value={scope.values[field.key]}>
              {#each field.options as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else if field.type === "number"}
            <input type="number" min={field.min} max={field.max} bind:value={scope.values[field.key]} />
          {:else}
            <input bind:value={scope.values[field.key]} />
          {/if}
          {#if field.help}<small class="muted">{field.help}</small>{/if}
        </label>
      {/each}
      <button class="primary" onclick={() => save(scope)}>{saved === scope.scope ? "Saved" : "Save"}</button>
    </section>
  {/each}

  <section class="panel">
    <h2>Image cache</h2>
    {#if cache}<p>{cache.files} files, {size(cache.bytes)}</p>{/if}
    <button class="danger" onclick={clearCache}>Clear cache</button>
  </section>
</div>

<style>
  .stack {
    display: grid;
    gap: 16px;
    max-width: 760px;
  }
  .field {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
  }
  .field small {
    grid-column: 2;
  }
</style>
