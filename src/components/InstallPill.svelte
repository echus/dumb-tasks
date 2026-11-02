<script lang="ts">
  import Icon from './Icon.svelte';
  import { install, promptInstall, SHORT_STEPS } from '$lib/ui/install.svelte';
  import * as ui from '$lib/ui/icons';

  // How to install the app, in a pill under the intro: short, so the intro isn't a wall of
  // grey text. The sync menu says it in full.
</script>

{#if install.way === 'prompt'}
  <button class="pill" onclick={promptInstall}><Icon svg={ui.install} size={14} />Install app</button>
{:else if install.way}
  {@const [where, choose] = SHORT_STEPS[install.way]}
  <p class="pill">
    <Icon svg={ui.install} size={14} /><strong>Install app:</strong>
    {#if where}{where}{:else}<span class="menu" role="img" aria-label="browser menu"
        ><Icon svg={ui.browserMenu} size={14} /></span
      >{/if}
    → {choose}
  </p>
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
  }

  button.pill {
    font-weight: 600;
    cursor: pointer;
  }

  button.pill:hover {
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  strong {
    font-weight: 600;
  }

  /* The ⋮ menu button, drawn as a key to press */
  .menu {
    display: inline-grid;
    padding: 1px 0;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--border-strong);
  }
</style>
