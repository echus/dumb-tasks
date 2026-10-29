<script lang="ts">
  import { liveQuery } from 'dexie';
  import BucketList from './components/BucketList.svelte';
  import BucketName from './components/BucketName.svelte';
  import HistoryButtons from './components/HistoryButtons.svelte';
  import SyncMenu from './components/SyncMenu.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import { db } from './lib/db';
  import { sync } from './lib/sync/sync.svelte';
  import { isDemoTask } from './lib/tasks/demo-tasks';
  import { byPosition, isActive } from './lib/tasks/tasks';
  import { BUCKETS, type Bucket, type Task } from './lib/types';
  import { drag } from './lib/ui/state.svelte';

  // Re-runs whenever the tasks table changes, from any tab.
  const tasks = liveQuery(() => db.tasks.toArray());

  const grouped = $derived.by(() => {
    const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as Task[]])) as Record<Bucket, Task[]>;
    for (const t of ($tasks ?? []).filter(isActive)) out[t.bucket].push(t);
    for (const b of BUCKETS) out[b].sort(byPosition);
    return out;
  });

  // Only the demo tasks, or nothing to do (a first visit, or everything done): say what the
  // app is. Waits for the first read so it doesn't flash up before the tasks load.
  const showIntro = $derived($tasks !== undefined && $tasks.filter(isActive).every(isDemoTask));

  // Which bucket shows when they're tabs (below desktop width). Kept for this session only,
  // so a refresh stays put but a fresh visit opens on today.
  function savedTab(): Bucket {
    try {
      const saved = sessionStorage.getItem('tab');
      if (BUCKETS.includes(saved as Bucket)) return saved as Bucket;
    } catch {
      // Storage blocked: start on today.
    }
    return 'today';
  }
  let activeTab = $state<Bucket>(savedTab());
  $effect(() => {
    try {
      sessionStorage.setItem('tab', activeTab);
    } catch {
      // Not persisted; the tab still switches.
    }
  });

  // The phone tab bar sticks to the top, so each list's add row sticks just below it.
  let barHeight = $state(0);
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
    <SyncMenu />
    <ThemeToggle />
  </div>
</header>

{#if showIntro}
  <p class="intro">
    Dumb Tasks is a simple local-first task list. Tasks stay on your device, or sync through
    {sync.driveAvailable ? 'Google Drive or ' : ''}your WebDAV server. <a href="/privacy">Privacy</a>
  </p>
{/if}

<div class="bar" bind:clientHeight={barHeight}>
  <!-- Dropping a dragged task on a tab sends it to the end of that list, without switching
       tabs; holding it there opens the tab (see dnd.ts) -->
  <div class="tabs" role="tablist" aria-label="Buckets">
    {#each BUCKETS as bucket (bucket)}
      <button
        role="tab"
        aria-selected={activeTab === bucket}
        aria-controls="panel-{bucket}"
        data-tab={bucket}
        class:drop-target={drag.id && drag.overTab === bucket}
        onclick={() => (activeTab = bucket)}><BucketName {bucket} /></button
      >
    {/each}
  </div>
</div>

<main style:--sticky-top="{barHeight}px">
  {#each BUCKETS as bucket (bucket)}
    <BucketList {bucket} active={activeTab === bucket} tasks={grouped[bucket]} />
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
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  /* Positioned so the sync menu's panel lines up with the header's right edge */
  .header-actions {
    position: relative;
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

  /* Also where Google expects the privacy link on the homepage */
  .intro {
    margin: 4px 0 8px;
    color: var(--muted);
  }

  .intro a {
    color: inherit;
  }

  .intro a:hover {
    color: var(--text);
  }

  /* Tabs stay reachable while scrolling a long list */
  .bar {
    position: sticky;
    top: 0;
    z-index: 2;
    margin: 0 calc(-1 * var(--gutter));
    padding: 0 var(--gutter) 8px;
    background: var(--bg);
  }

  /* Phone layout: the tabs are plain text like the desktop bucket names; the selected one
     is in ink and underlined, the rest grey */
  .tabs {
    display: flex;
    gap: 2px;
    padding-top: 8px;
  }

  /* Side padding shrinks on narrow phones so all four tabs, icons included, fit */
  .tabs button {
    position: relative;
    padding: 8px clamp(6px, (100vw - 300px) / 8, 12px) 5px;
    margin-bottom: 4px; /* the underline sits close under the name; this keeps the gap below */
    border: none;
    background: none;
    color: var(--ink-faded);
    font-family: var(--font-title);
    font-variation-settings: var(--title-opsz);
    font-size: 0.95rem;
    font-weight: 700;
    text-transform: lowercase;
    cursor: pointer;
  }

  .tabs button[aria-selected='true'] {
    color: var(--text);
  }

  /* Drawn as a line of its own rather than a border, so it stays straight when the tab's
     corners round (below) */
  .tabs button[aria-selected='true']::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: var(--accent);
  }

  /* Dragging a task onto a tab shades it in, so it's clear the task will drop there (the
     same grey as the label on the dragged task) */
  .tabs button.drop-target {
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--text) 14%, var(--bg));
    color: var(--text);
  }

  main {
    display: grid;
    gap: 20px;
    padding: 0 0 96px;
  }

  @media (min-width: 1100px) {
    .bar {
      display: none;
    }

    /* Takes the rest of the window; lists taller than that scroll inside it */
    main {
      flex: 1;
      min-height: 0;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr);
      gap: 16px;
      align-items: start;
      padding: 8px 0 24px;
    }
  }
</style>
