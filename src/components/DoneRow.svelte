<script lang="ts">
  import Icon from './Icon.svelte';
  import * as ui from '$lib/ui/icons';
  import { uncompleteTask } from '$lib/tasks/tasks';
  import { track } from '$lib/tasks/history.svelte';
  import { doneGlides, undoneGlides } from '$lib/ui/done-motion';
  import type { Task } from '$lib/types';

  let { task }: { task: Task } = $props();

  async function undo() {
    await track([task.id], () => uncompleteTask(task.id));
  }
</script>

<!-- A task done today: struck through at the bottom of its list. Ticking it again puts it
     back where it was. -->
<li in:doneGlides.in={{ key: task.id }} out:undoneGlides.out={{ key: task.id }}>
  <button class="icon" style:--circle={task.colour} aria-label="Mark not done: {task.text}" onclick={undo}>
    <Icon svg={ui.check} size={16} />
  </button>
  <span class="text">{task.text}</span>
</li>

<style>
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 12px;
    color: var(--muted);
  }

  li:not(:first-child) {
    border-top: 1px solid var(--bg);
  }

  /* The same circle as a task to do, showing the tick it was given */
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
    color: var(--on-tint);
    cursor: pointer;
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
</style>
