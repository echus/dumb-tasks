<script lang="ts">
  import TaskRow from './TaskRow.svelte';
  import { finishDrop } from '../lib/dnd';
  import { BUCKET_LABELS, type Bucket, type Task } from '../lib/types';
  import { drag } from '../lib/ui-state.svelte';

  interface Props {
    bucket: Bucket;
    active: boolean; // the selected tab, when buckets are shown as tabs
    tasks: Task[];
  }

  let { bucket, active, tasks }: Props = $props();

  const dropTarget = $derived(!!drag.id && drag.bucket === bucket);

  // Over a task: land above or below it. Anywhere else in the list: at the end.
  function ondrop(e: DragEvent) {
    e.preventDefault();
    finishDrop();
  }
</script>

<section
  id="panel-{bucket}"
  class:drop-target={dropTarget}
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
  <h2 id="heading-{bucket}">{BUCKET_LABELS[bucket]}</h2>

  <div class="list">
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
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
  }

  .list {
    overflow: hidden;
    border-radius: var(--radius);
    background: var(--surface);
  }

  /* Dragging a task over a list outlines it in a mid grey */
  .drop-target .list {
    outline: 1px solid var(--border-strong);
    outline-offset: -1px;
  }

  /* Below desktop width the buckets are tabs: only the selected one shows, and the tab
     already names it. */
  @media (max-width: 1099px) {
    section.inactive {
      display: none;
    }

    /* Square where the selected tab joins on */
    .list {
      border-top-left-radius: 0;
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
