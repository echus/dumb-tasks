<script lang="ts">
  import Icon from '../Icon.svelte';
  import { install, promptInstall, STEPS } from '$lib/ui/install.svelte';
  import * as ui from '$lib/ui/icons';

  // Install the app, so it opens like any other app: shown until it runs installed
</script>

{#if install.way}
  <section>
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
