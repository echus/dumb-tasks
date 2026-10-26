<script lang="ts">
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import { exportData, importData, parseDataFile } from '../lib/data-file';
  import { toISODate } from '../lib/deadline';
  import { showToast } from '../lib/ui-state.svelte';

  let open = $state(false);
  let fileInput: HTMLInputElement;

  async function exportBackup() {
    open = false;
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dumb-tasks-${toISODate(new Date())}.json`;
    a.click();
    // Revoking straight away can cancel the download in Safari.
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importBackup(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { added, merged } = await importData(parseDataFile(await file.text()));
      showToast(`Imported: ${added} new, ${merged} merged`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed');
    }
  }
</script>

<svelte:window
  onkeydown={(e) => e.key === 'Escape' && (open = false)}
  onclick={() => (open = false)}
/>

<div class="menu">
  <button
    class="trigger"
    aria-label="Menu"
    aria-expanded={open}
    onclick={(e) => {
      e.stopPropagation();
      open = !open;
    }}
  >
    <Ellipsis size={20} />
  </button>

  {#if open}
    <div class="panel" role="menu">
      <button role="menuitem" onclick={exportBackup}>Export backup</button>
      <button
        role="menuitem"
        onclick={() => {
          open = false;
          fileInput.click();
        }}>Import backup…</button
      >
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="application/json,.json"
    hidden
    onchange={importBackup}
  />
</div>

<style>
  .menu {
    position: relative;
  }

  .trigger {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .trigger:hover {
    background: var(--chip);
    color: var(--text);
  }

  .panel {
    position: absolute;
    right: 0;
    top: 40px;
    z-index: 5;
    display: grid;
    min-width: 180px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.12);
  }

  .panel button {
    padding: 9px 10px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
  }

  .panel button:hover {
    background: var(--chip);
  }
</style>
