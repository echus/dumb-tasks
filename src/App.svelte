<script lang="ts">
  import { liveQuery } from 'dexie';
  import AddTask from './components/AddTask.svelte';
  import BucketList from './components/BucketList.svelte';
  import Menu from './components/Menu.svelte';
  import ToastBar from './components/ToastBar.svelte';
  import { db } from './lib/db';
  import { byPosition, isActive } from './lib/tasks';
  import { BUCKETS, type Bucket, type Task } from './lib/types';

  // Re-runs whenever the tasks table changes, from any tab.
  const tasks = liveQuery(() => db.tasks.toArray());

  const grouped = $derived.by(() => {
    const out = Object.fromEntries(BUCKETS.map((b) => [b, [] as Task[]])) as Record<Bucket, Task[]>;
    for (const t of ($tasks ?? []).filter(isActive)) out[t.bucket].push(t);
    for (const b of BUCKETS) out[b].sort(byPosition);
    return out;
  });

  let selectedId = $state<string | null>(null);
</script>

<header>
  <h1>Dumb Tasks</h1>
  <Menu />
</header>

<AddTask />

<main>
  {#each BUCKETS as bucket (bucket)}
    <BucketList
      {bucket}
      tasks={grouped[bucket]}
      {selectedId}
      onselect={(id) => (selectedId = selectedId === id ? null : id)}
    />
  {/each}
</main>

<ToastBar />

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0 4px;
  }

  h1 {
    font-size: 1.05rem;
    font-weight: 650;
    letter-spacing: -0.01em;
    margin: 0;
  }

  main {
    display: grid;
    gap: 28px;
    padding: 20px 0 96px;
  }

  @media (min-width: 1100px) {
    main {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 24px;
      align-items: start;
    }
  }
</style>
