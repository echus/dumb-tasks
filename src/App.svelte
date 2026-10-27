<script lang="ts">
  import { liveQuery } from 'dexie';
  import { MediaQuery } from 'svelte/reactivity';
  import AddTask from './components/AddTask.svelte';
  import BucketList from './components/BucketList.svelte';
  import BucketName from './components/BucketName.svelte';
  import HistoryButtons from './components/HistoryButtons.svelte';
  import Icon from './components/Icon.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import { db } from './lib/db';
  import { byPosition, isActive } from './lib/tasks';
  import { finishDrop } from './lib/dnd';
  import * as ui from './lib/ui-icons';
  import { BUCKETS, type Bucket, type Task } from './lib/types';
  import { drag } from './lib/ui-state.svelte';

  // Re-runs whenever the tasks table changes, from any tab.
  const tasks = liveQuery(() => db.tasks.toArray());

  const grouped = $derived.by(() => {
    const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as Task[]])) as Record<Bucket, Task[]>;
    for (const t of ($tasks ?? []).filter(isActive)) out[t.bucket].push(t);
    for (const b of BUCKETS) out[b].sort(byPosition);
    return out;
  });

  // Which bucket shows when they're tabs (below desktop width)
  let activeTab = $state<Bucket>('today');
  const desktop = new MediaQuery('min-width: 1100px');

  // The add box is hidden until the + button opens it
  let adding = $state(false);
</script>

<header class:adding>
  <h1>
    <svg class="mark" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="8" />
      <path d="M4.5 8.3 7 10.8 11.5 5.5" />
    </svg><span class="wordmark">dumb tasks</span>
  </h1>
  <!-- One box for every list: it adds to the selected tab, or Today when there are no tabs -->
  <div class="add">
    {#if adding}
      <AddTask bucket={desktop.current ? 'today' : activeTab} onclose={() => (adding = false)} />
    {/if}
  </div>
  <div class="header-actions">
    <!-- Keeps the box focused on press, so its blur doesn't close it before the click
         toggles it -->
    <button
      class="add-button"
      aria-label="Add a task"
      title="Add a task"
      aria-expanded={adding}
      onpointerdown={(e) => e.preventDefault()}
      onclick={() => (adding = !adding)}
    >
      <Icon svg={ui.plus} size={18} />
    </button>
    <HistoryButtons />
    <ThemeToggle />
  </div>
</header>

<div class="bar">
  <!-- Dropping a task on a tab sends it to the end of that list, without switching tabs -->
  <div class="tabs" role="tablist" aria-label="Buckets">
    {#each BUCKETS as bucket (bucket)}
      <button
        role="tab"
        aria-selected={activeTab === bucket}
        aria-controls="panel-{bucket}"
        data-tab={bucket}
        class:drop-target={drag.id && drag.overTab === bucket}
        onclick={() => (activeTab = bucket)}
        ondragover={(e) => {
          if (!drag.id) return;
          e.preventDefault();
          drag.bucket = drag.overTab = bucket;
          drag.overTask = null;
        }}
        ondragleave={(e) => {
          const into = e.relatedTarget as Node | null;
          if (into && !(e.currentTarget as Node).contains(into) && drag.overTab === bucket) {
            drag.bucket = drag.overTab = null;
          }
        }}
        ondrop={(e) => {
          e.preventDefault();
          finishDrop();
        }}><BucketName {bucket} /></button
      >
    {/each}
  </div>
</div>

<main>
  {#each BUCKETS as bucket (bucket)}
    <BucketList {bucket} active={activeTab === bucket} tasks={grouped[bucket]} />
  {/each}
</main>

<style>
  /* Logo, the add box filling the middle, then the buttons */
  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 20px 0 8px;
  }

  .add {
    width: 100%;
    max-width: 480px;
    justify-self: center;
  }

  /* Same as the other header buttons; ink while its box is open */
  .add-button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    background: none;
    color: var(--ink-faded);
    cursor: pointer;
  }

  .add-button:hover,
  .add-button[aria-expanded='true'] {
    color: var(--accent);
  }

  /* Narrow phones: just the ticked circle while the add box is open, so it has room */
  @media (max-width: 480px) {
    .adding .wordmark {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .adding h1 .mark {
      margin-right: 0;
    }
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
    padding: 8px clamp(6px, (100vw - 300px) / 8, 12px) 4px;
    margin-bottom: 4px; /* the underline sits close under the name; this keeps the gap below */
    border: none;
    border-bottom: 2px solid transparent;
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
    border-bottom-color: var(--accent);
    color: var(--text);
  }

  /* Dragging a task onto a tab: the same thin line as the insertion line, under its name */
  .tabs button.drop-target {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 5px;
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

    main {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
      padding-top: 8px;
    }
  }
</style>
