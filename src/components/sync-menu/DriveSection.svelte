<script lang="ts">
  import Icon from '../Icon.svelte';
  import Status from './Status.svelte';
  import SyncNowButton from './SyncNowButton.svelte';
  import { connectDrive, disconnect, reconnectDrive, sync } from '$lib/sync/sync.svelte';
  import * as ui from '$lib/ui/icons';

  interface Props {
    showError: boolean; // sync's error is about Drive
    ontry: () => void; // a connect starts, whose error should show here
  }

  let { showError, ontry }: Props = $props();
</script>

<section>
  <h2><span class="icon"><Icon svg={ui.drive} size={14} /></span>Google Drive sync</h2>
  {#if sync.service === 'drive'}
    <Status />
    <div class="actions">
      {#if sync.needsSignIn}
        <button class="action" onclick={reconnectDrive}>Sign in again</button>
      {:else}
        <SyncNowButton />
      {/if}
      <button class="action" onclick={disconnect}>Disconnect</button>
    </div>
  {:else if sync.service === 'webdav'}
    <p>Disconnect WebDAV to sync with Google Drive.</p>
  {:else}
    <p>Sync your tasks with Google Drive to use them on all your devices.</p>
    <button
      class="action"
      onclick={() => {
        ontry();
        connectDrive();
      }}>Connect Google Drive</button
    >
  {/if}
  {#if showError}
    <p class="error">{sync.error}</p>
  {/if}
</section>
