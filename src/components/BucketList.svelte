<script lang="ts">
  import AddTask from './AddTask.svelte';
  import BucketName from './BucketName.svelte';
  import DoneRow from './DoneRow.svelte';
  import Icon from './Icon.svelte';
  import * as ui from '$lib/ui/icons';
  import { doneRows, toggleDoneRows } from '$lib/ui/state.svelte';
  import TaskRow from './TaskRow.svelte';
  import { BUCKET_LABELS, type Bucket, type Task } from '$lib/types';

  interface Props {
    bucket: Bucket;
    active: boolean; // the selected tab, when buckets are shown as tabs
    tasks: Task[];
    done: Task[]; // done today, newest first
  }

  let { bucket, active, tasks, done }: Props = $props();
</script>

<section
  id="panel-{bucket}"
  class:inactive={!active}
  aria-labelledby="heading-{bucket}"
>
  <h2 id="heading-{bucket}"><BucketName {bucket} /></h2>

  <div class="list">
    <!-- Scrolls on desktop, under the list's edge (.list::before) so that stays put -->
    <div class="scroll">
      <!-- New tasks land at the top of a list, so the row to write one sits there -->
      <AddTask {bucket} autofocus={bucket === 'today'} />
      <ul>
        {#each tasks as task, i (task.id)}
          <TaskRow {task} first={i === 0} last={i === tasks.length - 1} />
        {/each}
      </ul>
      <div class="done">
        {#if done.length}
          <button
            class="done-toggle"
            aria-expanded={doneRows.open}
            aria-controls="done-{bucket}"
            onclick={toggleDoneRows}
          >
            {done.length} done today
            <span class="caret" class:closed={!doneRows.open}><Icon svg={ui.caretDown} size={12} /></span>
          </button>
        {/if}
        <!-- Always there while open, even empty, so the first task done glides in: a row only
             glides when its own list adds it. Closed, a ticked task fades away instead. -->
        {#if doneRows.open}
          <ul id="done-{bucket}" aria-label={done.length ? `Done today in ${BUCKET_LABELS[bucket]}` : undefined}>
            {#each done as task (task.id)}
              <DoneRow {task} />
            {/each}
          </ul>
        {/if}
      </div>
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

  .done-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 12px;
    border: none;
    border-top: 1px solid var(--bg);
    background: none;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .done-toggle:hover {
    color: var(--text);
  }

  /* At the far right, over where the row buttons sit */
  .caret {
    display: grid;
    place-items: center;
    width: 24px;
    transition: transform 150ms;
  }

  .caret.closed {
    transform: rotate(-90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    .caret {
      transition: none;
    }
  }

  /* The same divider under the "add a task" row as between tasks */
  ul > :global(li:first-child) {
    border-top: 1px solid var(--bg);
  }
</style>
