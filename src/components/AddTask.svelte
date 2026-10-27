<script lang="ts">
  import { track } from '../lib/history.svelte';
  import { addTask } from '../lib/tasks';

  let { onadd }: { onadd?: () => void } = $props();

  let text = $state('');
  let input: HTMLInputElement;

  // Fast capture: ready to type the moment the app opens.
  $effect(() => input.focus());

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const value = text;
    text = '';
    input.focus();
    if (await track(null, () => addTask(value))) onadd?.();
  }
</script>

<form onsubmit={submit}>
  <input
    bind:this={input}
    bind:value={text}
    placeholder="add a task"
    aria-label="New task"
    autocomplete="off"
    enterkeyhint="done"
  />
</form>

<style>
  form {
    display: flex;
    padding: 8px 0;
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 13px 15px;
    border: none;
    border-radius: var(--radius);
    background: var(--surface);
    caret-color: var(--accent);
  }

  input::placeholder {
    color: var(--icon-quiet);
    opacity: 1;
  }

  input:focus {
    outline: none;
  }
</style>
