<script lang="ts">
  import type { Snippet } from 'svelte';
  import BucketName from './BucketName.svelte';
  import TaskRow from './TaskRow.svelte';
  import { finishDrop } from '../lib/dnd';
  import type { Bucket, Task } from '../lib/types';
  import { drag } from '../lib/ui-state.svelte';

  interface Props {
    bucket: Bucket;
    active: boolean; // the selected tab, when buckets are shown as tabs
    tasks: Task[];
    children?: Snippet; // shown between the bucket name and the list
  }

  let { bucket, active, tasks, children }: Props = $props();

  // Over the list but not over a task: the task will go at the end, so the line sits there
  const dropAtEnd = $derived(!!drag.id && drag.bucket === bucket && !drag.overTask);

  // Over a task: TaskRow tracks above/below. Anywhere else in the list: at the end.
  function ondrop(e: DragEvent) {
    e.preventDefault();
    finishDrop();
  }
</script>

<section
  id="panel-{bucket}"
  class:inactive={!active}
  aria-labelledby="heading-{bucket}"
  ondragover={(e) => {
    if (!drag.id) return;
    e.preventDefault();
    drag.bucket = bucket;
    drag.overTask = null;
    drag.overTab = null;
  }}
  ondragleave={(e) => {
    const into = e.relatedTarget as Node | null;
    if (into && !(e.currentTarget as Node).contains(into) && drag.bucket === bucket) {
      drag.bucket = null;
      drag.overTask = null;
    }
  }}
  {ondrop}
>
  <h2 id="heading-{bucket}"><BucketName {bucket} /></h2>

  {@render children?.()}

  <div class="list" class:drop-end={dropAtEnd}>
    {#if tasks.length}
      <ul>
        {#each tasks as task (task.id)}
          <TaskRow {task} />
        {/each}
      </ul>
    {:else}
      <p class="empty">nothing yet...</p>
    {/if}
  </div>
</section>

<style>
  /* The bucket name is plain text above its white list */
  h2 {
    margin: 0;
    padding: 0 2px 8px;
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
  }

  /* Well rounded, so the list reads as separate from the square-cornered "add a task" box
     above it. Half a row's height, so the corners curve round the first and last icons. */
  .list {
    position: relative;
    overflow: hidden;
    border-radius: 23px;
    background: var(--surface);
    box-shadow: 0 0 10px var(--glow);
  }

  /* The glow's thin edge, drawn on top so rows and dividers don't cover it */
  .list::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--glow-ring);
    pointer-events: none;
  }

  /* A straight line along the bottom (an inset shadow would follow the rounded corners) */
  .list.drop-end::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--accent);
  }

  /* Below desktop width the buckets are tabs: only the selected one shows, and the tab
     already names it. */
  @media (max-width: 1099px) {
    section.inactive {
      display: none;
    }

    h2 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .empty {
    margin: 0;
    padding: 11px 12px;
    line-height: 1.4;
    color: var(--border-strong);
  }
</style>
