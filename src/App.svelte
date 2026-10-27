<script lang="ts">
  import { liveQuery } from 'dexie';
  import AddTask from './components/AddTask.svelte';
  import BucketList from './components/BucketList.svelte';
  import HistoryButtons from './components/HistoryButtons.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import { db } from './lib/db';
  import { byPosition, isActive } from './lib/tasks';
  import { finishDrop } from './lib/dnd';
  import { BUCKETS, BUCKET_LABELS, type Bucket, type Task } from './lib/types';
  import { drag } from './lib/ui-state.svelte';

  // Re-runs whenever the tasks table changes, from any tab.
  const tasks = liveQuery(() => db.tasks.toArray());

  const grouped = $derived.by(() => {
    const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as Task[]])) as Record<Bucket, Task[]>;
    for (const t of ($tasks ?? []).filter(isActive)) out[t.bucket].push(t);
    for (const b of BUCKETS) out[b].sort(byPosition);
    return out;
  });

  // Which bucket shows when they're tabs (below desktop width). New tasks land in Today,
  // so adding one switches back there to show it.
  let activeTab = $state<Bucket>('today');
</script>

<header>
  <h1>
    <svg class="mark" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" />
      <path d="M4.5 8.3 7 10.8 11.5 5.5" />
    </svg>dumb tasks
  </h1>
  <div class="header-actions">
    <HistoryButtons />
    <ThemeToggle />
  </div>
</header>

<div class="bar">
  <AddTask onadd={() => (activeTab = 'today')} />

  <!-- Dropping a task on a tab sends it to the end of that list, without switching tabs -->
  <div class="tabs" role="tablist" aria-label="Buckets">
    {#each BUCKETS as bucket (bucket)}
      <button
        role="tab"
        aria-selected={activeTab === bucket}
        aria-controls="panel-{bucket}"
        data-tab={bucket}
        onclick={() => (activeTab = bucket)}
        ondragover={(e) => {
          if (!drag.id) return;
          e.preventDefault();
          drag.bucket = bucket;
          drag.overTask = null;
        }}
        ondrop={(e) => {
          e.preventDefault();
          finishDrop();
        }}>{BUCKET_LABELS[bucket]}</button
      >
    {/each}
  </div>
</div>

<main>
  {#each BUCKETS as bucket (bucket)}
    <BucketList
      {bucket}
      active={activeTab === bucket}
      tasks={grouped[bucket]}
    />
  {/each}
</main>

{#if drag.touch && drag.id}
  <div class="drag-preview" style:left="{drag.x}px" style:top="{drag.y}px">{drag.label}</div>
{/if}

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 0 8px;
  }

  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  /* A ticked circle, matching the task icons */
  .mark {
    width: 0.8em;
    height: 0.8em;
    margin-right: 0.4em;
    vertical-align: -0.05em;
  }

  .mark circle {
    fill: var(--accent);
  }

  .mark path {
    fill: none;
    stroke: var(--on-accent);
    stroke-width: 2;
  }

  /* Input and tabs stay reachable while scrolling a long list */
  .bar {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0 calc(-1 * var(--gutter));
    padding: 0 var(--gutter) 8px;
    background: var(--bg);
  }

  /* Phone layout: the tabs are plain text like the desktop bucket names; the selected one
     gets a white tab that sits directly on top of the white list below it */
  .tabs {
    display: flex;
    gap: 2px;
    margin-top: 8px;
  }

  .tabs button {
    padding: 8px 12px;
    border: none;
    border-radius: var(--radius) var(--radius) 0 0;
    background: none;
    color: var(--text);
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    background: var(--surface);
  }

  /* Follows the finger during a touch drag */
  .drag-preview {
    position: fixed;
    z-index: 10;
    max-width: 70vw;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--border-strong);
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    transform: translate(-50%, -130%);
  }

  .bar {
    padding-bottom: 0;
  }

  main {
    display: grid;
    gap: 20px;
    padding: 0 0 96px;
  }

  @media (min-width: 1100px) {
    .tabs {
      display: none;
    }

    .bar {
      padding-bottom: 8px;
    }

    main {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
      padding-top: 8px;
    }
  }
</style>
