<script lang="ts">
  import Icon from '../Icon.svelte';
  import { exportData, importData, parseDataFile } from '../../lib/sync/data-file';
  import { localChanged } from '../../lib/sync/local-changes';
  import * as ui from '../../lib/ui/icons';

  // Save all tasks to a file, or restore them from one: merged in, like a sync

  let fileInput = $state<HTMLInputElement>();
  let message = $state('');

  async function download() {
    const data = await exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dumb-tasks-${data.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = '';
    if (!file) return;
    try {
      const { added } = await importData(parseDataFile(await file.text()));
      message = `Restored. ${added} new task${added === 1 ? '' : 's'}.`;
      localChanged();
    } catch (e) {
      message = e instanceof SyntaxError ? 'This file is not a Dumb Tasks backup.' : (e as Error).message;
    }
  }
</script>

<section>
  <h2><span class="icon"><Icon svg={ui.download} size={14} /></span>Backup</h2>
  <div class="actions">
    <button class="action" onclick={download}>Save backup</button>
    <button class="action" onclick={() => fileInput?.click()}>Restore</button>
  </div>
  <input type="file" accept=".json,application/json" hidden bind:this={fileInput} onchange={upload} />
  {#if message}
    <p class="result">{message}</p>
  {/if}
</section>
