<script lang="ts">
  import Icon from './Icon.svelte';
  import { exportData, importData, parseDataFile } from '../lib/data-file';
  import { loadGoogle } from '../lib/google-auth';
  import { localChanged } from '../lib/sync';
  import { connect, disconnect, reconnect, sync, syncNow } from '../lib/sync-state.svelte';
  import * as ui from '../lib/ui-icons';

  let open = $state(false);
  let menu: HTMLElement;
  let fileInput = $state<HTMLInputElement>();
  let backupMessage = $state('');

  const attention = $derived(sync.connected && (sync.needsSignIn || Boolean(sync.error)));
  const icon = $derived(
    !sync.connected
      ? ui.cloud
      : attention
        ? ui.cloudWarning
        : sync.syncing
          ? ui.cloudSyncing
          : ui.cloudCheck,
  );
  const label = $derived(
    !sync.connected ? 'Sync and backup' : attention ? 'Sync needs attention' : 'Synced with Google Drive',
  );

  function toggle() {
    open = !open;
    backupMessage = '';
    // Google's script has to be loaded before the click that opens its popup.
    if (open && sync.available) loadGoogle().catch(() => {});
  }

  function ago(iso: string): string {
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(iso).toLocaleDateString();
  }

  async function download() {
    const data = await exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dumb-tasks-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    try {
      const { added } = await importData(parseDataFile(await file.text()));
      backupMessage = `Restored. ${added} new task${added === 1 ? '' : 's'}.`;
      localChanged();
    } catch (e) {
      backupMessage = e instanceof SyntaxError ? "That file isn't a Dumb Tasks backup." : (e as Error).message;
    }
  }

  function onwindowclick(e: MouseEvent) {
    if (open && !menu.contains(e.target as Node)) open = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={onwindowclick} {onkeydown} />

<div class="menu" bind:this={menu}>
  <button class="icon-button" aria-label={label} title={label} aria-expanded={open} onclick={toggle}>
    <Icon svg={icon} size={18} />
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Sync and backup">
      <section>
        <h2>Google Drive sync</h2>
        {#if !sync.available}
          <p>Sync isn't set up on this copy of the app.</p>
        {:else if !sync.connected}
          <p>See and edit your tasks on all your devices. They're kept in a hidden folder in your Google Drive.</p>
          <button class="action" onclick={connect}>Connect Google Drive</button>
        {:else}
          <p class="account">{sync.email}</p>
          {#if sync.needsSignIn}
            <p>Google asks you to sign in again every so often to keep syncing.</p>
          {:else if sync.syncing}
            <p>Syncing…</p>
          {:else if sync.lastSyncedAt}
            <p>Synced {ago(sync.lastSyncedAt)}</p>
          {/if}
          <div class="actions">
            {#if sync.needsSignIn}
              <button class="action" onclick={reconnect}>Sign in again</button>
            {:else}
              <button class="action" disabled={sync.syncing} onclick={syncNow}>Sync now</button>
            {/if}
            <button class="action quiet" onclick={disconnect}>Disconnect</button>
          </div>
        {/if}
        {#if sync.error}
          <p class="error">{sync.error}</p>
        {/if}
      </section>

      <section>
        <h2>Backup</h2>
        <p>Save all your tasks to a file, or restore from one. Restoring merges; it never deletes.</p>
        <div class="actions">
          <button class="action" onclick={download}>Save backup</button>
          <button class="action" onclick={() => fileInput?.click()}>Restore…</button>
        </div>
        <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={upload} />
        {#if backupMessage}
          <p>{backupMessage}</p>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }

  .icon-button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--ink-faded);
    cursor: pointer;
  }

  .icon-button:hover {
    color: var(--accent);
  }

  .panel {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 5;
    width: min(300px, calc(100vw - 2 * var(--gutter)));
    margin-top: 4px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow:
      inset 0 0 0 1px var(--glow-ring),
      0 4px 16px rgb(0 0 0 / 0.15);
  }

  section {
    padding: 14px 16px;
  }

  section + section {
    border-top: 1px solid var(--glow-ring);
  }

  h2 {
    margin: 0 0 4px;
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
  }

  p {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 0.9em;
  }

  .account {
    color: var(--text);
    margin-bottom: 2px;
    overflow-wrap: anywhere;
  }

  .error {
    margin: 10px 0 0;
    color: color-mix(in srgb, var(--due-soon) var(--due-soon-ink-mix), black);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .action {
    padding: 6px 12px;
    border: none;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
  }

  .action.quiet {
    background: none;
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }

  .action:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
