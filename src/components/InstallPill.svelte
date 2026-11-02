<script lang="ts">
  import Icon from './Icon.svelte';
  import { install, promptInstall } from '$lib/ui/install.svelte';
  import * as ui from '$lib/ui/icons';
  import { menu } from '$lib/ui/state.svelte';

  // "Install app" in a pill under the intro, the same in every browser so the intro stays
  // short. It opens the browser's install prompt where there is one; elsewhere it opens the
  // sync menu at the install steps, which also shows where to find them later.

  function onclick(e: MouseEvent) {
    if (install.way === 'prompt') return promptInstall();
    e.stopPropagation(); // else this click, reaching the window, would close the menu again
    menu.open = true;
    menu.highlight = 'install';
  }
</script>

{#if install.way}
  <button class="pill" {onclick}><Icon svg={ui.install} size={14} />Install app</button>
{/if}

<style>
  /* An outline, like the deadline badges, in ink */
  .pill {
    display: inline-flex;
    width: fit-content; /* the desktop layout stretches what's in it */
    align-items: center;
    gap: 6px;
    margin: 0 0 10px;
    padding: 4px 12px 4px 10px;
    border: none;
    border-radius: 999px;
    background: none;
    box-shadow: inset 0 0 0 1px var(--border-strong);
    color: var(--text);
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
  }

  .pill:hover {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
</style>
