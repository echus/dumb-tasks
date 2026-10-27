<script lang="ts">
  import { track } from '../lib/history.svelte';
  import { addTask } from '../lib/tasks';
  import { BUCKET_LABELS, type Bucket } from '../lib/types';

  // Only Today's box takes focus on open, so one tap captures a thought
  let { bucket, autofocus = false }: { bucket: Bucket; autofocus?: boolean } = $props();

  let text = $state('');
  let input: HTMLInputElement;

  $effect(() => {
    if (autofocus) input.focus();
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
  />
</form>

<style>
  form {
    display: flex;
    padding: 0 0 8px;
  }

  /* An ink border (black, or white in dark mode), so the box stands out from the list */
  input {
    flex: 1;
    min-width: 0;
    padding: 13px 15px;
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
