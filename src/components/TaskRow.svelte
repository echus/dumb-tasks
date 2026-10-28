<script lang="ts">
  import Icon from './Icon.svelte';
  import { daysUntil, deadlineHeat, describeDeadline } from '../lib/deadline';
  import { PLAIN_ICON } from '../lib/task-icons';
  import * as ui from '../lib/ui-icons';
  import { completeTask, deleteTask, dismissDeadline, editText } from '../lib/tasks';
  import { track } from '../lib/history.svelte';
  import type { Task } from '../lib/types';
  import { dragTask } from '../lib/dnd';
  import { clock, drag } from '../lib/ui-state.svelte';

  let { task }: { task: Task } = $props();

  // Clicking a task turns it into a text field. Moving between buckets is by dragging.
  let editing = $state(false);
  let draft = $state('');
  let caret = 0;
  let words = $state<HTMLElement>();


  // Split the text around the parsed deadline phrase so it can be underlined.
  const parts = $derived.by(() => {
    const phrase = task.deadline?.phrase;
    const i = phrase ? task.text.indexOf(phrase) : -1;
    if (!phrase || i < 0) return { before: task.text, phrase: '', after: '' };
    return {
      before: task.text.slice(0, i),
      phrase,
      after: task.text.slice(i + phrase.length),
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

  async function removeDeadline() {
    editing = false;
    await track([task.id], () => dismissDeadline(task.id));
  }

  async function remove() {
    editing = false;
    await track([task.id], () => deleteTask(task.id));
  }
</script>

<li
  data-task-id={task.id}
  use:dragTask={{ id: task.id }}
  class:dragging={drag.id !== null}
>
  <div class="row">
    <!-- The task's icon doubles as its checkbox: hovering shows a tick, clicking completes -->
    <button
      class="icon"
      style:--circle={task.colour}
      aria-label="Mark done"
      onclick={complete}
    >
      <span class="task-glyph">{task.icon ?? PLAIN_ICON}</span>
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
      </button>
    {/if}

    <!-- One fixed spot at the right: the deadline badge, swapped on hover for the delete x
         (and a button to drop the date, if it was read wrongly). Badges line up down a list
         and long text wraps before them. -->
    <span class="end">
      {#if task.deadline}
        <span
          class="badge"
          class:overdue={daysUntil(task.deadline.date, clock.now) < 0}
          style:--heat={deadlineHeat(task.deadline.date, clock.now)}
        >
          {describeDeadline(task.deadline.date, clock.now)}
        </span>
      {/if}
      <span class="actions">
        {#if task.deadline}
          <button
            aria-label="Remove date"
            title="Remove date"
            onpointerdown={keepFocus}
            onclick={removeDeadline}
          >
            <Icon svg={ui.calendarX} size={14} />
          </button>
        {/if}
        <button aria-label="Delete" onpointerdown={keepFocus} onclick={remove}>
          <Icon svg={ui.x} size={14} />
        </button>
      </span>
    </span>
  </div>
</li>

<style>
  /* Pressing and dragging picks a task up, so don't let it select text or show a menu */
  li {
    -webkit-touch-callout: none;
    user-select: none;
  }

  /* Barely-there dividers: the page background colour, against the white list */
  li:not(:first-child) {
    border-top: 1px solid var(--bg);
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 12px;
  }

  /* A circle tinted with the task's fluoro colour. On hover
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
    background: color-mix(in srgb, var(--circle) var(--circle-tint), var(--tint-base));
    color: var(--muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .task-glyph {
    display: block;
  }

  .done-glyph {
    display: none;
  }

  /* Hovering or focusing the icon keeps the circle and swaps the emoji for a tick. Hover
     only counts where there's a real mouse: phones keep the last-tapped spot "hovered",
     which left ticks showing. None of it applies while a task is being dragged (.dragging is
     on every row then), so the rows it passes over don't light up. */
  li:not(.dragging) .icon:focus-visible {
    color: var(--on-tint);
  }

  li:not(.dragging) .icon:focus-visible .task-glyph {
    display: none;
  }

  li:not(.dragging) .icon:focus-visible .done-glyph {
    display: contents;
  }

  @media (hover: hover) {
    li:not(.dragging) .icon:hover {
      color: var(--on-tint);
    }

    li:not(.dragging) .icon:hover .task-glyph {
      display: none;
    }

    li:not(.dragging) .icon:hover .done-glyph {
      display: contents;
    }
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

  /* Shades from green with plenty of time, through yellow, to red when it's due: --heat
     (0 → 1) runs green → yellow over its first half and yellow → red over its second.
     Upcoming ones are just an outline, so they don't compete with the icon circles;
     overdue is filled dark red with light text, the one that should catch the eye. */
  .badge {
    --ink: color-mix(
      in oklch,
      var(--due-soon-ink) clamp(0%, (var(--heat) * 2 - 1) * 100%, 100%),
      color-mix(
        in oklch,
        var(--due-near-ink) clamp(0%, var(--heat) * 200%, 100%),
        var(--due-later-ink)
      )
    );
    padding: 0 8px;
    border: 1px solid var(--ink);
    border-radius: 999px; /* a pill, round like the icon circles */
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.6;
    text-transform: lowercase;
    white-space: nowrap;
    color: var(--ink);
  }

  .badge.overdue {
    border-color: transparent;
    background: color-mix(in srgb, var(--due-soon) 85%, black);
    color: #ffffff;
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

  /* Badge and x share one grid cell, so the spot keeps its size whichever is showing */
  .end {
    flex: none;
    display: grid;
    align-items: center;
    justify-items: end;
  }

  .end > * {
    grid-area: 1 / 1;
  }

  li:not(.dragging):hover .badge,
  li:not(.dragging):focus-within .badge {
    visibility: hidden;
  }

  /* Small buttons, shown on hover (or while the task is open on touch screens) */
  .actions {
    display: flex;
    visibility: hidden;
  }

  li:not(.dragging):hover .actions,
  li:not(.dragging):focus-within .actions {
    visibility: visible;
  }

  .actions button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: var(--radius);
    border: none;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }

  .actions button:hover {
    color: var(--accent);
  }
</style>
