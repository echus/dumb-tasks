<script lang="ts">
  import TaskRow from './TaskRow.svelte';
  import { moveTask } from '../lib/tasks';
  import { BUCKET_LABELS, type Bucket, type Task } from '../lib/types';
  import { drag } from '../lib/ui-state.svelte';

  interface Props {
    bucket: Bucket;
    tasks: Task[];
    selectedId: string | null;
    onselect: (id: string) => void;
  }

  let { bucket, tasks, selectedId, onselect }: Props = $props();

  let dropTarget = $state(false);

  const EMPTY: Record<Bucket, string> = {
    today: 'Nothing yet. Dump a task above.',
    week: 'Things to pull into Today soon.',
    month: 'Needs doing, not urgent.',
    icebox: 'Ideas for someday.',
  };

  // Dropping on the list itself (not on a task) puts the task at the end.
  function ondrop(e: DragEvent) {
    e.preventDefault();
    dropTarget = false;
    if (drag.id) moveTask(drag.id, bucket, null);
    drag.id = null;
  }
</script>

<section
  class:drop-target={dropTarget}
  class:today={bucket === 'today'}
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
  <h2 id="heading-{bucket}">
    {BUCKET_LABELS[bucket]}
    {#if tasks.length}<span class="count">{tasks.length}</span>{/if}
  </h2>

  {#if tasks.length}
    <ul>
      {#each tasks as task (task.id)}
        <TaskRow {task} selected={selectedId === task.id} onselect={() => onselect(task.id)} />
      {/each}
    </ul>
  {:else}
    <p class="empty">{EMPTY[bucket]}</p>
  {/if}
</section>

<style>
  section {
    border-radius: 14px;
    transition: background-color 0.15s;
  }

  section.drop-target {
    background: var(--accent-ring);
  }

  h2 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 6px;
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .today h2 {
    color: var(--text);
  }

  .count {
    font-weight: 500;
    letter-spacing: 0;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .empty {
    margin: 0;
    padding: 10px 0;
    font-size: 0.9rem;
    color: var(--muted);
  }
</style>
