<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash from '@lucide/svelte/icons/trash';
  import { deadlineUrgency, describeDeadline } from '../lib/deadline';
  import { TASK_ICONS } from '../lib/task-icons';
  import {
    completeTask,
    deleteTask,
    editText,
    keepHere,
    moveTask,
    restoreTask,
    sendTo,
    uncompleteTask,
  } from '../lib/tasks';
  import { BUCKETS, BUCKET_LABELS, type Task } from '../lib/types';
  import { clock, drag, showToast } from '../lib/ui-state.svelte';

  interface Props {
    task: Task;
    selected: boolean;
    onselect: () => void;
  }

  let { task, selected, onselect }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let dropBefore = $state(false);

  const Icon = $derived(task.icon ? TASK_ICONS[task.icon] : null);

  // Split the text around the parsed deadline phrase so it can be underlined.
  const parts = $derived.by(() => {
    const i = task.deadlineText ? task.text.indexOf(task.deadlineText) : -1;
    if (i < 0) return { before: task.text, phrase: '', after: '' };
    return {
      before: task.text.slice(0, i),
      phrase: task.deadlineText!,
      after: task.text.slice(i + task.deadlineText!.length),
    };
  });

  function startEdit() {
    draft = task.text;
    editing = true;
  }

  async function saveEdit() {
    if (!editing) return;
    editing = false;
    if (draft.trim() && draft.trim() !== task.text) await editText(task.id, draft);
  }

  async function complete() {
    await completeTask(task.id);
    showToast('Done', () => uncompleteTask(task.id));
  }

  async function remove() {
    await deleteTask(task.id);
    showToast('Deleted', () => restoreTask(task.id));
  }

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function ondrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dropBefore = false;
    if (drag.id && drag.id !== task.id) moveTask(drag.id, task.bucket, task.id);
    drag.id = null;
  }
</script>

<li
  class:selected
  class:drop-before={dropBefore}
  draggable={!editing}
  ondragstart={(e) => {
    drag.id = task.id;
    e.dataTransfer?.setData('text/plain', task.text);
  }}
  ondragend={() => (drag.id = null)}
  ondragover={(e) => {
    if (!drag.id || drag.id === task.id) return;
    e.preventDefault();
    dropBefore = true;
  }}
  ondragleave={() => (dropBefore = false)}
  {ondrop}
>
  <div class="row">
    <button class="check" aria-label="Mark done" onclick={complete}>
      <Check size={14} strokeWidth={3} />
    </button>

    <span class="icon" data-category={task.category ?? 'none'} aria-hidden="true">
      {#if Icon}<Icon size={15} />{:else}<span class="dot"></span>{/if}
    </span>

    {#if editing}
      <input
        class="edit"
        bind:value={draft}
        use:focusInput
        aria-label="Edit task"
        enterkeyhint="done"
        onkeydown={(e) => {
          if (e.key === 'Enter') saveEdit();
          if (e.key === 'Escape') editing = false;
        }}
        onblur={saveEdit}
      />
    {:else}
      <button class="text" aria-expanded={selected} onclick={onselect}>
        {parts.before}{#if parts.phrase}<span class="phrase">{parts.phrase}</span>{/if}{parts.after}
        {#if task.deadline}
          <span class="badge" data-urgency={deadlineUrgency(task.deadline, clock.now)}>
            {describeDeadline(task.deadline, clock.now)}
          </span>
        {/if}
      </button>
      {#if !task.sorted}<span class="new" title="Not sorted yet"></span>{/if}
    {/if}
  </div>

  {#if selected && !editing}
    <div class="actions">
      {#each BUCKETS as b (b)}
        {#if b !== task.bucket}
          <button class="chip" onclick={() => sendTo(task.id, b)}>{BUCKET_LABELS[b]}</button>
        {:else if !task.sorted}
          <button class="chip" onclick={() => keepHere(task.id)}>Keep in {BUCKET_LABELS[b]}</button>
        {/if}
      {/each}
      <span class="spacer"></span>
      <button class="tool" aria-label="Edit" onclick={startEdit}><Pencil size={16} /></button>
      <button class="tool" aria-label="Delete" onclick={remove}><Trash size={16} /></button>
    </div>
  {/if}
</li>

<style>
  li {
    border-top: 1px solid var(--border);
    border-radius: 0;
  }

  li:last-child {
    border-bottom: 1px solid var(--border);
  }

  li.drop-before {
    box-shadow: inset 0 2px 0 var(--accent);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
  }

  .check {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1.5px solid var(--border-strong);
    border-radius: 50%;
    background: none;
    color: transparent;
    cursor: pointer;
  }

  .check:hover,
  .check:focus-visible {
    border-color: var(--accent);
    color: var(--accent);
  }

  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    color: var(--cat);
    background: var(--cat-bg);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cat);
  }

  .text {
    flex: 1;
    min-width: 0;
    padding: 10px 0;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    text-align: left;
    line-height: 1.35;
    overflow-wrap: anywhere;
    cursor: pointer;
  }

  .phrase {
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-decoration-thickness: 1.5px;
    text-underline-offset: 3px;
  }

  .badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 550;
    white-space: nowrap;
    vertical-align: 1px;
    color: var(--muted);
    background: var(--chip);
  }

  .badge[data-urgency='near'] {
    color: var(--warn);
    background: var(--warn-bg);
  }

  .badge[data-urgency='soon'],
  .badge[data-urgency='overdue'] {
    color: var(--danger);
    background: var(--danger-bg);
  }

  .new {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
  }

  .edit {
    flex: 1;
    min-width: 0;
    margin: 6px 0;
    padding: 6px 8px;
    font: inherit;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    outline: none;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 0 0 10px 32px;
  }

  .chip {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--accent);
  }

  .spacer {
    flex: 1;
  }

  .tool {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .tool:hover {
    background: var(--chip);
    color: var(--text);
  }
</style>
