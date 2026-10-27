<script lang="ts">
  import AddTask from './AddTask.svelte';
  import BucketName from './BucketName.svelte';
  import TaskRow from './TaskRow.svelte';
  import { finishDrop } from '../lib/dnd';
  import type { Bucket, Task } from '../lib/types';
  import { drag } from '../lib/ui-state.svelte';

  interface Props {
    bucket: Bucket;
    active: boolean; // the selected tab, when buckets are shown as tabs
    tasks: Task[];
  }

  let { bucket, active, tasks }: Props = $props();

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

  <div class="list" class:drop-end={dropAtEnd}>
    <!-- Scrolls on desktop, under the list's edge (.list::before) so that stays put -->
    <div class="scroll">
      <!-- New tasks land at the top of a list, so the row to write one sits there -->
      <AddTask {bucket} autofocus={bucket === 'today'} />
      <ul>
        {#each tasks as task (task.id)}
          <TaskRow {task} />
        {/each}
      </ul>
    </div>
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

  /* clip, not hidden: hidden would make the list a scroll box, and on phones the sticky add
     row would stick inside it instead of to the page */
  .list {
    position: relative;
    overflow: clip;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 0 10px var(--glow);
  }

  /* The glow's thin edge, drawn on top so rows and dividers don't cover it */
  .list::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2; /* above the sticky add row too */
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

  /* Desktop: a list no taller than the window, scrolling within itself, add row stuck on top */
  @media (min-width: 1100px) {
    section {
      display: flex;
      flex-direction: column;
      max-height: 100%;
    }

    .list {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .scroll {
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* The same divider under the "add a task" row as between tasks */
  ul > :global(li:first-child) {
    border-top: 1px solid var(--bg);
  }
</style>
