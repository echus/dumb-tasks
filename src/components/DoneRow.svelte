<script lang="ts">
  import Icon from './Icon.svelte';
  import * as ui from '$lib/ui/icons';
  import { deleteTask, uncompleteTask } from '$lib/tasks/tasks';
  import { track } from '$lib/tasks/history.svelte';
  import { doneGlides, undoneGlides } from '$lib/ui/done-motion';
  import type { Task } from '$lib/types';

  // `when`: the day it was done, where the list mixes days
  let { task, when }: { task: Task; when?: string } = $props();

  async function undo() {
    await track([task.id], () => uncompleteTask(task.id));
  }

  // For a task ticked off that should have been deleted
  async function remove() {
    await track([task.id], () => deleteTask(task.id));
  }
</script>

<!-- A task done today: struck through at the bottom of its list. Ticking it again puts it
     back where it was. -->
<li in:doneGlides.in={{ key: task.id }} out:undoneGlides.out={{ key: task.id }}>
  <!-- The circle and text are one button, so a tap anywhere on them undoes it -->
  <button class="undo" aria-label="Mark not done: {task.text}" onclick={undo}>
    <span class="icon" style:--circle={task.colour}><Icon svg={ui.check} size={16} /></span>
    <span class="text">{task.text}</span>
    {#if when}<span class="when">{when}</span>{/if}
  </button>
  <button class="delete" aria-label="Delete {task.text}" onclick={remove}>
    <Icon svg={ui.x} size={14} />
  </button>
</li>

<style>
  li {
    display: flex;
    align-items: center;
    padding-right: 12px;
  }

  li:not(:first-child) {
    border-top: 1px solid var(--bg);
  }

  .undo {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 10px 0 12px;
    border: none;
    background: none;
    color: var(--ink-done);
    text-align: left;
    cursor: pointer;
  }

  /* The circle keeps a faded trace of its colour, and the tick it was given */
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--circle) var(--done-tint), var(--fill-done));
    color: var(--ink-done);
  }

  .text {
    flex: 1;
    min-width: 0;
    padding: 11px 0;
    line-height: 1.4;
    overflow-wrap: anywhere;
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
  }

  .when {
    flex: none;
    font-size: 0.8rem;
  }

  /* As on a task to do: shown on hover or focus */
  .delete {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--muted);
    cursor: pointer;
    visibility: hidden;
  }

  .delete:hover {
    color: var(--accent);
  }

  li:hover .delete,
  li:focus-within .delete {
    visibility: visible;
  }

  /* Touch screens have no hover, and a tap on the row undoes it, so the x stays, faint */
  @media (hover: none) {
    .delete {
      visibility: visible;
      color: var(--ink-done);
    }
  }
</style>
