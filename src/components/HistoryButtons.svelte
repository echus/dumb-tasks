<script lang="ts">
  import Icon from './Icon.svelte';
  import { history, redo, undo } from '../lib/history.svelte';
  import * as ui from '../lib/ui-icons';

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl+';

  // Keyboard shortcuts, except inside text fields, where the browser's own text undo applies.
  function onkeydown(e: KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault();
      redo();
    }
  }
</script>

<svelte:window {onkeydown} />

<button aria-label="Undo" title="Undo ({mod}Z)" disabled={!history.canUndo} onclick={undo}>
  <Icon svg={ui.undo} size={18} />
</button>
<button aria-label="Redo" title="Redo ({mod}{mac ? '⇧Z' : 'Y'})" disabled={!history.canRedo} onclick={redo}>
  <Icon svg={ui.redo} size={18} />
</button>

<style>
  button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--icon-quiet);
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    color: var(--accent);
  }

  button:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
