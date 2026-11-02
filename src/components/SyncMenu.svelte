<script lang="ts">
  import Icon from './Icon.svelte';
  import BackupSection from './sync-menu/BackupSection.svelte';
  import DriveSection from './sync-menu/DriveSection.svelte';
  import WebDavSection from './sync-menu/WebDavSection.svelte';
  import { loadGoogle } from '$lib/sync/google-auth';
  import { sync } from '$lib/sync/sync.svelte';
  import * as ui from '$lib/ui/icons';

  // The sync and backup menu: a button in the header, and a panel with a section for each
  // service and the backup (sync-menu/), and which version this is

  let open = $state(false);
  let menu: HTMLElement;
  // The service last tried, so a failed connect shows its error in that service's section
  let tried = $state<'drive' | 'webdav' | null>(null);
  const errorIn = $derived(sync.error ? (sync.service ?? tried) : null);

  const connected = $derived(sync.service !== null);
  const service = $derived(sync.service === 'webdav' ? 'WebDAV' : 'Google Drive');
  const attention = $derived(connected && (sync.needsSignIn || Boolean(sync.error)));
  const label = $derived(
    !connected ? 'Sync and backup' : attention ? 'Sync needs attention' : `Synced with ${service}`,
  );

  function toggle() {
    open = !open;
    // Google's script has to be loaded before the click that opens its popup.
    if (open && sync.driveAvailable && sync.service !== 'webdav') loadGoogle().catch(() => {});
  }

  function onwindowclick(e: MouseEvent) {
    // The path as clicked: a button that swaps itself out (Connect WebDAV) has left the menu by now
    if (open && !e.composedPath().includes(menu)) open = false;
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
      {#if sync.driveAvailable}
        <DriveSection showError={errorIn === 'drive'} ontry={() => (tried = 'drive')} />
      {/if}
      <WebDavSection showError={errorIn === 'webdav'} ontry={() => (tried = 'webdav')} />
      <BackupSection />

      <footer>
        <span>version {__COMMIT__}{import.meta.env.DEV ? ' (dev)' : ''}</span>
        <!-- Self-hosted builds (no Drive) have no privacy page: see vite.config.ts -->
        {#if sync.driveAvailable}
          <a href="/privacy">Privacy</a>
        {/if}
      </footer>
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

  /* The sections (sync-menu/) share these, so they are kept here, for the whole panel */
  .panel :global(section) {
    padding: 14px 16px;
  }

  .panel :global(section + section) {
    border-top: 1px solid var(--glow-ring);
  }

  /* Icon and name laid out like the bucket names (BucketName) */
  .panel :global(h2) {
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

  .panel :global(h2 .icon) {
    display: inline-grid;
    color: var(--muted);
    transform: translateY(0.05em);
  }

  .panel :global(p) {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 0.9em;
  }

  .panel :global(.account) {
    color: var(--text);
    margin-bottom: 2px;
    overflow-wrap: anywhere;
  }

  .panel :global(label) {
    display: grid;
    gap: 4px;
    margin-bottom: 10px;
    color: var(--muted);
    font-size: 0.9em;
  }

  /* Outlined like the buttons. 16px, so phones don't zoom in on focus */
  .panel :global(input) {
    min-width: 0;
    padding: 6px 8px;
    border: none;
    border-radius: var(--radius);
    background: none;
    box-shadow: inset 0 0 0 1px var(--border-strong);
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }

  .panel :global(input:focus) {
    outline: none;
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .panel :global(p a) {
    color: inherit;
  }

  .panel :global(.nowrap) {
    white-space: nowrap;
  }

  .panel :global(.error),
  .panel :global(.result) {
    margin: 10px 0 0;
  }

  .panel :global(.error) {
    color: var(--due-soon-ink);
  }

  .panel :global(.actions) {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Outlined: a solid ink button would outweigh everything else in the app */
  .panel :global(.action) {
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

  .panel :global(.action:hover:not(:disabled)) {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .panel :global(.action:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  /* Small print under the sections: which version this is (to check a device has updated),
     and where Play and Google expect a privacy link (only on the public instance) */
  footer {
    display: flex;
    justify-content: space-between;
    padding: 10px 16px;
    border-top: 1px solid var(--glow-ring);
    color: var(--muted);
    font-size: 0.8em;
  }

  footer a {
    color: inherit;
  }

  footer a:hover {
    color: var(--text);
  }
</style>
