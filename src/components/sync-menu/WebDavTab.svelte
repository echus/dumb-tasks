<script lang="ts">
  import Status from './Status.svelte';
  import SyncNowButton from './SyncNowButton.svelte';
  import { connectWebDav, disconnect, reconnectWebDav, sync } from '$lib/sync/sync.svelte';

  // The WebDAV option of the sync section

  interface Props {
    showError: boolean; // sync's error is about WebDAV
    ontry: () => void; // a connect starts, whose error should show here
  }

  let { showError, ontry }: Props = $props();

  const HELP = 'https://github.com/echus/dumb-tasks#set-up-webdav-sync';

  // The connect form: shown on request, as most people will want Drive
  let formOpen = $state(false);
  let fields = $state({ url: '', username: '', password: '' });
  let checking = $state(false); // trying the address and sign-in before saving them

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    ontry();
    checking = true;
    if (sync.service === 'webdav' && sync.needsSignIn) await reconnectWebDav(fields.password);
    else await connectWebDav(fields.url, fields.username, fields.password);
    checking = false;
    if (!sync.error) {
      fields = { url: '', username: '', password: '' };
      formOpen = false;
    }
  }

  // Connected: the form is done with, even before the first sync ends. Otherwise a quick
  // Disconnect, while that sync still runs, would bring the filled-in form back
  $effect(() => {
    if (sync.service !== 'webdav') return;
    fields = { url: '', username: '', password: '' };
    formOpen = false;
  });
</script>

{#if sync.service === 'webdav'}
  <Status />
  {#if sync.needsSignIn}
    <form onsubmit={submit}>
      <label>
        Password
        <input type="password" autocomplete="current-password" required bind:value={fields.password} />
      </label>
      <div class="actions">
        <button class="action" type="submit" disabled={checking}>Sign in again</button>
        <button class="action" type="button" onclick={disconnect}>Disconnect</button>
      </div>
    </form>
  {:else}
    <div class="actions">
      <SyncNowButton />
      <button class="action" onclick={disconnect}>Disconnect</button>
    </div>
  {/if}
{:else if sync.service === 'drive'}
  <p>Disconnect Google Drive to sync with WebDAV.</p>
{:else if formOpen}
  <form onsubmit={submit}>
    <label>
      Folder address
      <input type="url" autocomplete="url" placeholder="https://" required bind:value={fields.url} />
    </label>
    <label>
      Username
      <input autocomplete="username" autocapitalize="none" spellcheck="false" required bind:value={fields.username} />
    </label>
    <label>
      Password
      <input type="password" autocomplete="current-password" required bind:value={fields.password} />
    </label>
    <p>
      The app keeps your tasks in a <span class="nowrap">dumb-tasks</span> folder at this address. The server must allow this app:
      <a href={HELP} target="_blank" rel="noopener">set up the server</a>.
    </p>
    <div class="actions">
      <button class="action" type="submit" disabled={checking}>{checking ? 'Connecting…' : 'Connect'}</button>
      <button
        class="action"
        type="button"
        onclick={() => {
          formOpen = false;
          sync.error = '';
        }}>Cancel</button
      >
    </div>
  </form>
{:else}
  <p>Sync tasks to your server through WebDAV.</p>
  <button class="action" onclick={() => (formOpen = true)}>Connect WebDAV</button>
{/if}
{#if showError}
  <p class="error">{sync.error}</p>
{/if}
