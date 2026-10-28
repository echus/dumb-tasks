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
  <button
    class="icon-button"
    class:syncing={sync.syncing}
    class:attention
    aria-label={label}
    title={label}
    aria-expanded={open}
    onclick={toggle}
  >
    <Icon svg={ui.sync} size={18} />
  </button>

  {#if open}
    <div class="panel" role="dialog" aria-label="Sync and backup">
      <section>
        <h2><span class="icon"><Icon svg={ui.sync} size={14} /></span>Google Drive sync</h2>
        {#if !sync.available}
          <p>Sync isn't set up on this copy of the app.</p>
        {:else if !sync.connected}
          <p>Sync your tasks to Google Drive to access them on all your devices.</p>
          <button class="action" onclick={connect}>Connect Google Drive</button>
        {:else}
          <p class="account">{sync.email}</p>
          {#if sync.needsSignIn}
            <p>Google signed this device out. Sign in again to keep syncing.</p>
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
            <button class="action" onclick={disconnect}>Disconnect</button>
          </div>
        {/if}
        {#if sync.error}
          <p class="error">{sync.error}</p>
        {/if}
      </section>

      <section>
        <h2><span class="icon"><Icon svg={ui.download} size={14} /></span>Backup</h2>
        <div class="actions">
          <button class="action" onclick={download}>Save backup</button>
          <button class="action" onclick={() => fileInput?.click()}>Restore…</button>
        </div>
        <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={upload} />
        {#if backupMessage}
          <p class="result">{backupMessage}</p>
        {/if}
      </section>

      <a class="privacy" href="/privacy">Privacy</a>
    </div>
  {/if}
</div>

<style>
  /* No position here: the panel is placed against the header's button row (see App), so
     its right edge lines up with the header's, not with this button's */

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

  .icon-button.syncing :global(svg) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-button.syncing :global(svg) {
      animation: none;
    }
  }

  /* Signed out or failing: a small red dot on the icon */
  .icon-button.attention {
    position: relative;
  }

  .icon-button.attention::after {
    content: '';
    position: absolute;
    top: 8px;
    right: 7px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--due-soon);
  }

  .panel {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 5;
    width: min(300px, calc(100vw - 2 * var(--gutter)));
    margin-top: 4px;
    border-radius: var(--radius);
    /* Halfway between the page and the lists, so it doesn't read as another list */
    background: color-mix(in srgb, var(--bg), var(--surface));
    /* The same faint edge as the lists, and a small, fairly tight shadow */
    box-shadow:
      inset 0 0 0 1px var(--glow-ring),
      0 1px 4px rgb(0 0 0 / 0.1);
  }

  section {
    padding: 14px 16px;
  }

  section + section {
    border-top: 1px solid var(--glow-ring);
  }

  /* Icon and name laid out like the bucket names (BucketName) */
  h2 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
  }

  h2 .icon {
    display: inline-grid;
    color: var(--muted);
    transform: translateY(0.05em);
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

  .error,
  .result {
    margin: 10px 0 0;
  }

  .error {
    color: color-mix(in srgb, var(--due-soon) var(--due-soon-ink-mix), black);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Outlined: a solid ink button would outweigh everything else in the app */
  .action {
    padding: 6px 12px;
    border: none;
    border-radius: var(--radius);
    background: none;
    box-shadow: inset 0 0 0 1px var(--border-strong);
    color: var(--text);
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
  }

  .action:hover:not(:disabled) {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .action:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* Small print under the sections, where Play and Google expect a privacy link */
  .privacy {
    display: block;
    padding: 10px 16px;
    border-top: 1px solid var(--glow-ring);
    color: var(--muted);
    font-size: 0.8em;
    text-align: right;
  }

  .privacy:hover {
    color: var(--text);
  }
</style>
