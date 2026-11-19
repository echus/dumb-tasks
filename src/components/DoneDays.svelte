<script lang="ts">
  import DoneRow from './DoneRow.svelte';
  import Icon from './Icon.svelte';
  import { KEEP_DAYS } from '$lib/sync/data-file';
  import { doneDays } from '$lib/tasks/done-days';
  import * as ui from '$lib/ui/icons';
  import { closeDoneView } from '$lib/ui/done-view.svelte';
  import { clock } from '$lib/ui/state.svelte';
  import type { Task } from '$lib/types';

  let { tasks }: { tasks: Task[] } = $props();

  // From every list: once a day is over, which list a task was in no longer matters
  const days = $derived(doneDays(tasks, clock.now));

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !(e.target as HTMLElement).closest('input, [popover]')) closeDoneView();
  }
</script>

<svelte:window {onkeydown} />

<section aria-labelledby="done-days-title">
  <div class="inner">
    <div class="top">
      <button class="back" aria-label="Back to tasks" title="Back to tasks" onclick={closeDoneView}>
        <Icon svg={ui.arrowLeft} size={18} />
      </button>
      <h2 id="done-days-title">done</h2>
    </div>

    {#each days as day (day.day)}
      <h3 id="done-{day.day}">{day.label} <span class="count">{day.tasks.length}</span></h3>
      <div class="list">
        <ul aria-labelledby="done-{day.day}">
          {#each day.tasks as task (task.id)}
            <DoneRow {task} />
          {/each}
        </ul>
      </div>
    {:else}
      <p class="note">Nothing done yet. Tasks show here once they are ticked off.</p>
    {/each}

    <p class="note">Done tasks are kept for {KEEP_DAYS} days.</p>
  </div>
</section>

<style>
  section {
    flex: 1;
    padding: 8px 0 64px;
  }

  .inner {
    max-width: 560px;
  }

  /* Desktop: the page fills the window, so the days scroll within it */
  @media (min-width: 1100px) {
    section {
      min-height: 0;
      overflow-y: auto;
      scrollbar-width: thin;
      padding-bottom: 16px;
    }
  }

  .top {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 0 8px -8px; /* the arrow's own space, so it lines up with the page edge */
  }

  .back {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--ink-faded);
    cursor: pointer;
  }

  .back:hover {
    color: var(--accent);
  }

  h2,
  h3 {
    margin: 0;
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-weight: 700;
    text-transform: lowercase;
  }

  h2 {
    font-size: 1.1rem;
  }

  /* The same plain text above a white list as the bucket names */
  h3 {
    padding: 16px 2px 8px;
    font-size: 0.95rem;
  }

  .count {
    margin-left: 4px;
    color: var(--muted);
    font-weight: 600;
  }

  .list {
    position: relative;
    overflow: clip;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 0 10px var(--glow);
  }

  .list::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px var(--glow-ring);
    pointer-events: none;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .note {
    margin: 16px 2px 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
