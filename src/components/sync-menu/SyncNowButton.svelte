<script lang="ts">
  import { sync, syncNow } from '$lib/sync/sync.svelte';

  // Sync now, or Reload once another device has synced from a newer version of the app
</script>

{#if sync.needsUpdate}
  <button class="action" onclick={() => location.reload()}>Reload</button>
{:else}
  <button class="action" disabled={sync.syncing} onclick={syncNow}>Sync now</button>
{/if}
