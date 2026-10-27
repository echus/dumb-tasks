<script lang="ts">
  import { liveQuery } from 'dexie';
  import AddTask from './components/AddTask.svelte';
  import BucketList from './components/BucketList.svelte';
  import HistoryButtons from './components/HistoryButtons.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import { db } from './lib/db';
  import { byPosition, isActive } from './lib/tasks';
  import { BUCKETS, BUCKET_LABELS, type Bucket, type Task } from './lib/types';

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
      <rect width="16" height="16" />
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>dumb tasks
  </h1>
  <div class="header-actions">
    <HistoryButtons />
    <ThemeToggle />
  </div>
</header>

<div class="bar">
  <AddTask onadd={() => (activeTab = 'today')} />

  <div class="tabs" role="tablist" aria-label="Buckets">
    {#each BUCKETS as bucket (bucket)}
      <button
        role="tab"
        aria-selected={activeTab === bucket}
        aria-controls="panel-{bucket}"
        class:active={activeTab === bucket}
        data-bucket={bucket}
        onclick={() => (activeTab = bucket)}>{BUCKET_LABELS[bucket]}</button
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

  /* A ticked checkbox */
  .mark {
    width: 0.8em;
    height: 0.8em;
    margin-right: 0.4em;
    vertical-align: -0.05em;
  }

  .mark rect {
    fill: var(--accent);
  }

  .mark path {
    fill: none;
    stroke: var(--on-accent);
    stroke-width: 2.25;
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

  .tabs {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
  }

  .tabs button {
    padding: 9px 0;
    border: none;
    background: var(--bucket-bg);
    color: var(--bucket-fg);
    font-family: var(--font-display);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
    cursor: pointer;
  }

  .tabs button.active {
    box-shadow: inset 0 -3px 0 var(--bucket-fg);
  }

  main {
    display: grid;
    gap: 20px;
    padding: 8px 0 96px;
  }

  @media (min-width: 1100px) {
    .tabs {
      display: none;
    }

    main {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
    }
  }
</style>
