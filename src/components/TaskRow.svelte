<script lang="ts">
  import Icon from './Icon.svelte';
  import { deadlineUrgency, describeDeadline } from '../lib/deadline';
  import { guessIcon } from '../lib/guess-icon';
  import { TASK_ICONS } from '../lib/task-icons';
  import * as ui from '../lib/ui-icons';
  import {
    completeTask,
    deleteTask,
    editText,
  } from '../lib/tasks';
  import { track } from '../lib/history.svelte';
  import type { Task } from '../lib/types';
  import { touchDrag } from '../lib/dnd';
  import { clock, drag, endDrag } from '../lib/ui-state.svelte';

  let { task }: { task: Task } = $props();

  // Mouse drags use the browser's drag-and-drop; touch drags use touchDrag (long-press),
  // since built-in dragging on phones is unreliable and fights with scrolling.
  const finePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine)').matches;

  // Clicking a task turns it into a text field. Moving between buckets is by dragging.
  let editing = $state(false);
  let draft = $state('');
  let caret = 0;
  let words = $state<HTMLElement>();

  // Guessed fresh from the text, so older tasks pick up keyword improvements too; an icon
  // the AI chose is kept. Anything unmatched is an empty box, like a plain checkbox.
  const guess = $derived(
    task.iconSource === 'ai' && task.icon
      ? { icon: task.icon, category: task.category }
      : guessIcon(task.text),
  );
  const emoji = $derived(guess ? TASK_ICONS[guess.icon] : undefined);

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

  /** Where in the text a click landed, so the caret goes there like in any text field. */
  function clickOffset(e: MouseEvent): number | null {
    let node: Node | null = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) ({ offsetNode: node, offset } = pos);
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) ({ startContainer: node, startOffset: offset } = range);
    }
    if (!node || !words?.contains(node)) return null;

    let before = 0;
    const walker = document.createTreeWalker(words!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n === node) return before + offset;
      before += n.textContent!.length;
    }
    return null;
  }

  function startEdit(e: MouseEvent) {
    caret = clickOffset(e) ?? task.text.length;
    draft = task.text;
    editing = true;
  }

  function focusInput(node: HTMLInputElement) {
    node.focus();
    node.setSelectionRange(caret, caret);
  }

  async function saveEdit() {
    if (!editing) return;
    editing = false;
    if (draft.trim() && draft.trim() !== task.text) await track([task.id], () => editText(task.id, draft));
  }

  function cancelEdit() {
    draft = task.text;
    editing = false;
  }

  // The delete button keeps the text field focused, so on touch screens it doesn't
  // vanish (along with the field) before the tap lands.
  const keepFocus = (e: PointerEvent) => e.preventDefault();

  async function complete() {
    await track([task.id], () => completeTask(task.id));
  }

  async function remove() {
    editing = false;
    await track([task.id], () => deleteTask(task.id));
  }

  // Which half of this task the pointer is over decides whether a drop lands above or below
  // it. The drop itself is handled by the list.
  function ondragover(e: DragEvent) {
    if (!drag.id) return;
    e.stopPropagation();
    if (drag.id === task.id) {
      // Over itself: nowhere to drop, so no insertion line
      drag.bucket = null;
      drag.overTask = null;
      return;
    }
    drag.bucket = task.bucket;
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.overTask = task.id;
    drag.after = e.clientY > box.top + box.height / 2;
  }

  // The insertion line is the only sign of where a dragged task will land
  const dropLine = $derived(drag.id && drag.overTask === task.id ? (drag.after ? 'after' : 'before') : null);
</script>

<li
  data-task-id={task.id}
  draggable={!editing && finePointer}
  use:touchDrag={{ id: task.id, text: task.text }}
  ondragstart={(e) => {
    drag.id = task.id;
    e.dataTransfer?.setData('text/plain', task.text);
  }}
  ondragend={endDrag}
  {ondragover}
  class:drop-before={dropLine === 'before'}
  class:drop-after={dropLine === 'after'}
>
  <div class="row">
    <!-- The task's icon doubles as its checkbox: hovering shows a tick, clicking completes -->
    <button
      class="icon"
      data-category={guess?.category ?? 'none'}
      aria-label="Mark done"
      onclick={complete}
    >
      {#if emoji}<span class="task-glyph">{emoji}</span>{/if}
      <span class="done-glyph"><Icon svg={ui.check} size={16} /></span>
    </button>

    {#if editing}
      <input
        class="edit"
        bind:value={draft}
        use:focusInput
        aria-label="Task"
        enterkeyhint="done"
        onkeydown={(e) => {
          if (e.key === 'Enter') saveEdit();
          if (e.key === 'Escape') cancelEdit();
        }}
        onblur={saveEdit}
      />
    {:else}
      <button class="text" aria-label="Edit {task.text}" onclick={startEdit}>
        <span bind:this={words}
          >{parts.before}{#if parts.phrase}<span class="phrase">{parts.phrase}</span>{/if}{parts.after}</span
        >
        {#if task.deadline}
          <span class="badge" data-urgency={deadlineUrgency(task.deadline, clock.now)}>
            {describeDeadline(task.deadline, clock.now)}
          </span>
        {/if}
      </button>
    {/if}

    <button class="delete" aria-label="Delete" onpointerdown={keepFocus} onclick={remove}>
      <Icon svg={ui.x} size={14} />
    </button>
  </div>

</li>

<style>
  /* Long-pressing picks a task up, so don't let the phone select text or show a menu */
  li {
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* Barely-there dividers: the page background colour, against the white list */
  li:not(:first-child) {
    border-top: 1px solid var(--bg);
  }

  li.drop-before {
    box-shadow: inset 0 1px 0 var(--accent);
  }

  li.drop-after {
    box-shadow: inset 0 -1px 0 var(--accent);
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 12px;
  }

  /* A circle tinted with the task's category colour (grey when there's none). On hover
     the emoji turns into a tick. */
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: color-mix(in srgb, var(--cat) 26%, var(--surface));
    color: var(--muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  /* Lighter than the category tints, so a task with no icon reads as "blank" */
  .icon[data-category='none'] {
    background: color-mix(in srgb, var(--muted) 12%, var(--surface));
  }

  .task-glyph {
    display: block;
  }

  .done-glyph {
    display: none;
  }

  /* Hover keeps the circle as it is and swaps the emoji for a tick */
  .icon:hover,
  .icon:focus-visible {
    color: var(--text);
  }

  .icon:hover .task-glyph,
  .icon:focus-visible .task-glyph {
    display: none;
  }

  .icon:hover .done-glyph,
  .icon:focus-visible .done-glyph {
    display: contents;
  }

  .text {
    flex: 1;
    min-width: 0;
    padding: 11px 0;
    border: none;
    background: none;
    text-align: left;
    line-height: 1.4;
    overflow-wrap: anywhere;
    cursor: text;
  }

  .phrase {
    text-decoration: underline;
    text-decoration-color: var(--muted);
    text-decoration-style: dotted;
    text-decoration-thickness: 1.5px;
    text-underline-offset: 4px;
  }

  .badge {
    display: inline-block;
    margin-left: 8px;
    padding: 0 6px;
    border-radius: 2px;
    border: 1px solid var(--border-strong);
    font-family: var(--font-display);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.6;
    text-transform: lowercase;
    white-space: nowrap;
    vertical-align: 1px;
    color: var(--muted);
  }

  .badge[data-urgency='near'] {
    border-color: var(--text);
    color: var(--text);
  }

  .badge[data-urgency='soon'] {
    border-color: var(--text);
    background: var(--text);
    color: var(--bg);
  }

  .badge[data-urgency='overdue'] {
    border-color: var(--danger);
    background: var(--danger);
    color: var(--on-danger);
  }

  /* Sits exactly where the text was, so clicking in feels like editing in place */
  .edit {
    flex: 1;
    min-width: 0;
    padding: 11px 0;
    border: none;
    background: none;
    line-height: 1.4;
    caret-color: var(--accent);
    outline: none;
  }

  /* A small x at the far right, shown on hover (or while the task is open on touch screens) */
  .delete {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    margin-right: -6px;
    padding: 0;
    border-radius: var(--radius);
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
    visibility: hidden;
  }

  li:hover .delete,
  li:focus-within .delete {
    visibility: visible;
  }

  .delete:hover {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--ring);
  }
</style>
