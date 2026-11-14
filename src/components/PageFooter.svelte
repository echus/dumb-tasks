<script lang="ts">
  import Icon from './Icon.svelte';
  import { sync } from '$lib/sync/sync.svelte';
  import * as ui from '$lib/ui/icons';

  // Small print under the lists: who made the app, where to send feedback, the privacy page
  // (which Google expects the homepage to link to) and which version this is (to check a
  // device has updated). Self-hosted builds (no Drive) have no privacy page (see
  // vite.config.ts), and their feedback goes to GitHub, as the README says.

  const VERSION = `version ${__COMMIT__}${import.meta.env.DEV ? ' (dev)' : ''}`;
  // Only of use when checking a device has updated, so behind a small icon
  let showVersion = $state(false);
</script>

<footer>
  <span>dumb tasks is made by <a href="https://echus.co" target="_blank" rel="noopener">echus.co</a> instead of real work</span>
  {#if sync.driveAvailable}
    <span class="links">
      <a href="mailto:contact@dumbtasks.app?subject=Dumb%20Tasks%20feedback"
        ><Icon svg={ui.feedback} size={11} />feedback</a
      >
      <a href="/privacy"><Icon svg={ui.privacy} size={11} />privacy</a>
    </span>
  {/if}
  <span class="version">
    <button
      aria-label={showVersion ? 'Hide version' : 'Show version'}
      aria-expanded={showVersion}
      title={VERSION}
      onclick={() => (showVersion = !showVersion)}><Icon svg={ui.info} size={13} /></button
    >
    {#if showVersion}{VERSION}{/if}
  </span>
</footer>

<style>
  /* One faint line, centred. On a phone each part wraps as a whole, not word by word */
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 4px 16px;
    padding: 0 0 calc(32px + env(safe-area-inset-bottom));
    color: var(--muted);
    font-size: 0.8em;
    white-space: nowrap;
  }

  .links {
    display: flex;
    gap: 16px;
  }

  a {
    color: inherit;
  }

  /* Icon and name, with the underline only under the name */
  .links a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  /* The icons a hint beside the names, so smaller and fainter */
  .links a :global(.glyph) {
    color: color-mix(in srgb, var(--muted) 55%, transparent);
  }

  a:hover {
    color: var(--text);
  }

  /* Only there to check a device has updated, so barely there */
  .version {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: color-mix(in srgb, var(--muted) 45%, transparent);
  }

  /* Padded out past the icon, so it is not too fiddly to tap */
  .version button {
    display: grid;
    margin: -6px;
    padding: 6px;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  .version button:hover {
    color: var(--text);
  }

  /* Desktop: the lists fill the window, so this sits at its bottom edge */
  @media (min-width: 1100px) {
    footer {
      padding-bottom: 16px;
    }
  }
</style>
