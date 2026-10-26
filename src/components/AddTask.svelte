<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus';
  import { addTask } from '../lib/tasks';

  let text = $state('');
  let input: HTMLInputElement;

  // Fast capture: ready to type the moment the app opens.
  $effect(() => input.focus());

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const value = text;
    text = '';
    input.focus();
    await addTask(value);
  }
</script>

<form onsubmit={submit}>
  <input
    bind:this={input}
    bind:value={text}
    placeholder="Dump a task…"
    aria-label="New task"
    autocomplete="off"
    enterkeyhint="done"
  />
  <button type="submit" aria-label="Add task" disabled={!text.trim()}>
    <Plus size={20} />
  </button>
</form>

<style>
  form {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    gap: 8px;
    padding: 8px 0;
    background: var(--bg);
  }

  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    font-size: 1rem;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-ring);
  }

  button {
    display: grid;
    place-items: center;
    width: 46px;
    border: none;
    border-radius: 12px;
    background: var(--accent);
    color: var(--on-accent);
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
