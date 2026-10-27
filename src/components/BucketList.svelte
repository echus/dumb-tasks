<script lang="ts">
  import TaskRow from './TaskRow.svelte';
  import { track } from '../lib/history.svelte';
  import { moveTask } from '../lib/tasks';
  import { BUCKET_LABELS, type Bucket, type Task } from '../lib/types';
  import { drag } from '../lib/ui-state.svelte';

  interface Props {
    bucket: Bucket;
    active: boolean; // the selected tab, when buckets are shown as tabs
    tasks: Task[];
  }

  let { bucket, active, tasks }: Props = $props();

  let dropTarget = $state(false);

  // Dropping on the list itself (not on a task) puts the task at the end.
  function ondrop(e: DragEvent) {
    e.preventDefault();
    dropTarget = false;
    const id = drag.id;
    if (id) track([id], () => moveTask(id, bucket, null));
    drag.id = null;
  }
</script>

<section
  id="panel-{bucket}"
  class:drop-target={dropTarget}
  data-bucket={bucket}
  class:inactive={!active}
  aria-labelledby="heading-{bucket}"
  ondragover={(e) => {
    if (!drag.id) return;
    e.preventDefault();
    dropTarget = true;
  }}
  ondragleave={(e) => {
    if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) dropTarget = false;
  }}
  {ondrop}
>
  <h2 id="heading-{bucket}">{BUCKET_LABELS[bucket]}</h2>

  {#if tasks.length}
    <ul>
      {#each tasks as task (task.id)}
        <TaskRow {task} />
      {/each}
    </ul>
  {:else}
    <p class="empty">nothing yet...</p>
  {/if}
</section>

<style>
  section {
    background: var(--surface);
  }

  /* Today is framed in the accent, drawn on top so the rows don't cover it */
  section[data-bucket='today'] {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  /* Below desktop width the buckets are tabs: only the selected one shows,
     and the tab bar already names it. */
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

  section.drop-target {
    outline: 1px dashed var(--accent);
    outline-offset: -1px;
  }

  h2 {
    margin: 0;
    padding: 8px 12px;
    background: var(--bucket-bg);
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
    color: var(--bucket-fg);
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
