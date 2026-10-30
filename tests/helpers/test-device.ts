import Dexie from 'dexie';
import { vi } from 'vitest';

// One device with tabs of the app open. The sync module keeps its state per tab, so each
// tab is a fresh copy of it. All tabs share one database and one set of locks, as tabs on
// one device do. Test files also import 'fake-indexeddb/auto', for the database.

export type Tab = typeof import('../../src/lib/sync/sync.svelte');

/** A newly opened tab of the app. Modules imported straight after it are this tab's too. */
export async function openTab(): Promise<Tab> {
  vi.resetModules();
  const tab = await import('../../src/lib/sync/sync.svelte');
  await tab.startSync();
  return tab;
}

/** Before each test: navigator.locks, which jsdom doesn't have. */
export function setUpDevice() {
  Object.defineProperty(navigator, 'locks', { value: fakeLocks(), configurable: true });
}

/** After each test: the database, emptied. */
export function clearDevice(): Promise<void> {
  return Dexie.delete('dumb-tasks');
}

/** Requests for a name run one at a time, in order. */
function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request(name: string, fn: () => Promise<unknown>) {
      const run = (queues.get(name) ?? Promise.resolve()).then(fn);
      queues.set(name, run.catch(() => {}));
      return run;
    },
  };
}
