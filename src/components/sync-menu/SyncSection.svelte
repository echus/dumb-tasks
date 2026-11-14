<script lang="ts">
  import Icon from '../Icon.svelte';
  import DriveTab from './DriveTab.svelte';
  import ManualTab from './ManualTab.svelte';
  import WebDavTab from './WebDavTab.svelte';
  import { sync } from '$lib/sync/sync.svelte';
  import * as ui from '$lib/ui/icons';

  // One section for the ways to keep tasks safe: a pill for each, as only one sync service
  // can be on at a time. It opens on the connected service, else on Drive where there is
  // Drive (most people will want it)

  type Option = 'drive' | 'webdav' | 'manual';

  const OPTIONS: { id: Option; label: string }[] = [
    ...(sync.driveAvailable ? [{ id: 'drive' as const, label: 'Google Drive' }] : []),
    { id: 'webdav', label: 'WebDAV' },
    { id: 'manual', label: 'Manual' },
  ];

  let picked = $state<Option | null>(null);
  const shown = $derived<Option>(picked ?? sync.service ?? OPTIONS[0].id);

  // The service last tried, so a failed connect shows its error in that service's option
  let tried = $state<'drive' | 'webdav' | null>(null);
  const errorIn = $derived(sync.error ? (sync.service ?? tried) : null);
</script>

<section>
  <h2><span class="icon"><Icon svg={ui.sync} size={14} /></span>Sync</h2>
  <div class="pills" role="tablist" aria-label="Sync with">
    {#each OPTIONS as option (option.id)}
      <button
        class="pill"
        role="tab"
        aria-selected={shown === option.id}
        aria-controls="sync-option"
        onclick={() => (picked = option.id)}>{option.label}</button
      >
    {/each}
  </div>
  <div id="sync-option" role="tabpanel">
    {#if shown === 'drive'}
      <DriveTab showError={errorIn === 'drive'} ontry={() => (tried = 'drive')} />
    {:else if shown === 'webdav'}
      <WebDavTab showError={errorIn === 'webdav'} ontry={() => (tried = 'webdav')} />
    {:else}
      <ManualTab />
    {/if}
  </div>
</section>

<style>
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 12px;
  }

  /* The chosen one filled grey, the others plain text */
  .pill {
    padding: 4px 10px;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--muted);
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
  }

  .pill:hover {
    color: var(--text);
  }

  .pill[aria-selected='true'] {
    background: var(--fill-quiet);
    color: var(--text);
  }
</style>
