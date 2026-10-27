<script lang="ts">
  import { track } from '../lib/history.svelte';
  import { addTask } from '../lib/tasks';
  import { BUCKET_LABELS, type Bucket } from '../lib/types';

  // Shown by the header's + button, ready to type in. It stays open for the next task, and
  // closes on Escape or when left empty.
  let { bucket, onclose }: { bucket: Bucket; onclose: () => void } = $props();

  let text = $state('');
  let input: HTMLInputElement;

  $effect(() => {
    input.focus();
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const value = text;
    text = '';
    input.focus();
    await track(null, () => addTask(value, new Date(), bucket));
  }
</script>

<form onsubmit={submit}>
  <input
    bind:this={input}
    bind:value={text}
    placeholder="add a task"
    aria-label="New task in {BUCKET_LABELS[bucket]}"
    autocomplete="off"
    enterkeyhint="done"
    onkeydown={(e) => {
      if (e.key === 'Escape') onclose();
    }}
    onblur={() => {
      if (!text.trim()) onclose();
    }}
  />
</form>

<style>
  form {
    display: flex;
  }

  /* An ink border (black, or white in dark mode), so the box stands out from the list */
  input {
    flex: 1;
    min-width: 0;
    padding: 7px 12px;
    border: none;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow:
      inset 0 0 0 1px var(--text),
      0 0 10px var(--glow);
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
