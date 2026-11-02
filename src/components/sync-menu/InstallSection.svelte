<script lang="ts">
  import Icon from '../Icon.svelte';
  import { install, promptInstall, STEPS } from '$lib/ui/install.svelte';
  import * as ui from '$lib/ui/icons';
  import { menu } from '$lib/ui/state.svelte';

  // Install the app, so it opens like any other app: shown until it runs installed. The
  // install pill opens the menu here, outlined for a moment so the eye finds it.

  let section = $state<HTMLElement>();
  let pointedOut = $state(false);

  $effect(() => {
    if (menu.highlight !== 'install' || !section) return;
    menu.highlight = null;
    section.scrollIntoView({ block: 'nearest' });
    pointedOut = true;
  });
</script>

{#if install.way}
  <section bind:this={section} class:pointed-out={pointedOut} onanimationend={() => (pointedOut = false)}>
    <h2><span class="icon"><Icon svg={ui.install} size={14} /></span>Install app</h2>
    {#if install.way === 'prompt'}
      <p>Install Dumb Tasks as an app on this device to use it offline.</p>
      <div class="actions">
        <button class="action" onclick={promptInstall}>Install</button>
      </div>
    {:else}
      <p>{STEPS[install.way]}</p>
    {/if}
  </section>
{/if}

<style>
  /* An ink outline that fades out */
  .pointed-out {
    animation: point-out 1.6s ease-in forwards;
  }

  @keyframes point-out {
    from {
      box-shadow: inset 0 0 0 2px var(--accent);
    }
    to {
      box-shadow: inset 0 0 0 2px transparent;
    }
  }
</style>
