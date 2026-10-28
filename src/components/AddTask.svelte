<script lang="ts">
  import Icon from './Icon.svelte';
  import { track } from '../lib/history.svelte';
  import { addTask } from '../lib/tasks';
  import * as ui from '../lib/ui-icons';
  import { BUCKET_LABELS, type Bucket } from '../lib/types';

  // A row at the top of every list, like a task still to be written. Only Today's takes
  // focus on open, so one tap captures a thought.
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
  <span class="icon" aria-hidden="true"><Icon svg={ui.plus} size={14} /></span>
  <input
    bind:this={input}
    bind:value={text}
    placeholder="add a task"
    aria-label="New task in {BUCKET_LABELS[bucket]}"
    autocomplete="off"
    enterkeyhint="done"
  />
  {#if text.trim()}
    <!-- The Enter key's arrow, saying how to add it; also a button for touch screens -->
    <button class="enter" type="submit" aria-label="Add task" title="Add (Enter)">
      <Icon svg={ui.enter} size={16} />
    </button>
  {/if}
</form>

<style>
  /* Laid out like a task row (see TaskRow). Stays in view, just under the phone tabs, while
     a long list scrolls past. */
  form {
    position: sticky;
    top: var(--sticky-top, 0px);
    z-index: 1;
    background: var(--surface);
    box-shadow: 0 1px 0 var(--bg); /* the divider, over the first task's, so it stays when stuck */
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 12px;
  }

  /* An empty ring with a + where a task's emoji circle would be */
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--border-strong);
    color: var(--muted);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: 11px 0;
    border: none;
    background: none;
    line-height: 1.4;
    caret-color: var(--accent);
    outline: none;
  }

  input::placeholder {
    color: var(--icon-quiet);
    opacity: 1;
  }

  .enter {
    flex: none;
    display: grid;
    place-items: center;
    padding: 6px;
    margin-right: -6px; /* the arrow lines up with the badges below; the padding is tap room */
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .enter:hover {
    color: var(--text);
  }
</style>
