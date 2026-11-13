<script lang="ts">
  import { sync } from '$lib/sync/sync.svelte';

  // The connected account, and how syncing with it goes

  function ago(iso: string): string {
    const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return new Date(iso).toLocaleDateString();
  }
</script>

<p class="account">{sync.account}</p>
{#if sync.needsSignIn && sync.service === 'webdav'}
  <p>The server did not accept the saved password. Enter the password again to continue to sync.</p>
{:else if sync.needsSignIn}
  <p>Google signed out this device. Sign in again to continue to sync.</p>
{:else if sync.syncing || sync.changesWaiting}
  <p>Syncing…</p>
{:else if sync.lastSyncedAt}
  <p>Synced {ago(sync.lastSyncedAt)}</p>
{/if}
