import { db } from '../db';
import { isUneditedDemo } from '../tasks/demo-tasks';
import { lastEdited } from '../tasks/tasks';
import type { DataFile, Task } from '../types';
import { exportData, importData, KEEP_DAYS, parseDataFile } from './data-file';
import { mergeTask } from './merge';

// Sync is backend-agnostic. Each device has a file of its own holding everything it knows,
// and writes only that one, so two devices can never overwrite each other's changes. A sync
// reads the files other devices changed, merges them into local data, and rewrites this
// device's file if that left it out of date. Taking in another device's change rewrites
// this device's file too, so every file soon holds every change, and any one of them can
// go (see removeStale) without losing anything.

export interface SyncBackend {
  /**
   * The other devices' files changed since `cursor`, or all of them when it's null, and the
   * cursor for next time.
   */
  pull(cursor: string | null): Promise<{ files: RemoteFile[]; cursor: string }>;
  /** Writes this device's file. */
  push(json: string): Promise<void>;
  /**
   * Deletes other devices' files that haven't changed for `maxAge` ms: devices no longer
   * used, whose changes every other file already has. Returns whether this device's file
   * is there.
   */
  removeStale(maxAge: number): Promise<{ hasOwnFile: boolean }>;
}

export interface RemoteFile {
  json: string;
  modifiedAt: number; // ms, by the backend's clock
}

/** Kept between syncs, so each only reads and writes what changed. */
export interface SyncState {
  cursor: string | null; // where the last pull got up to
  pushedKey: string | null; // a hash of what this device's file holds
}

/** JSON with object keys sorted, so equal data always gives the same string. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

/** A short hash of what a data file holds, ignoring when it was written and task order. */
async function contentKey(data: DataFile): Promise<string> {
  const tasks = [...data.tasks].sort((a, b) => a.id.localeCompare(b.id));
  const text = stableStringify({ tasks, memory: data.memory, memoryUpdatedAt: data.memoryUpdatedAt });
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Several data files as one, merged the same way importing each in turn would. */
function combine(files: DataFile[]): DataFile {
  const tasks = new Map<string, Task>();
  for (const file of files) {
    for (const task of file.tasks) {
      const had = tasks.get(task.id);
      tasks.set(task.id, had ? mergeTask(had, task) : task);
    }
  }
  const newest = files.reduce((a, b) => (b.memoryUpdatedAt > a.memoryUpdatedAt ? b : a));
  return { ...newest, tasks: [...tasks.values()] };
}

/**
 * Local tasks to drop when reading every file finds that no other device has them. Only
 * files written after `after` count: a device that wrote one had read this device's file
 * first, so lacks a task only if it dropped it. An older file may just predate the task.
 */
export interface DropMissing {
  matches: (t: Task) => boolean;
  after: number; // ms
}

/**
 * Where a sync starts reading, and which local tasks it drops if no other device has them.
 * A first sync reads everything, and drops the demo tasks for an account's own. So does one
 * after more than KEEP_DAYS away, dropping tasks unchanged since: the other devices have
 * dropped them by now, as deleted or completed long ago, and this one never heard.
 */
export function startFrom(
  lastSyncedAt: string | null,
  cursor: string | null,
  now = new Date(),
): { cursor: string | null; dropMissing?: DropMissing } {
  if (lastSyncedAt === null) {
    return { cursor: null, dropMissing: { matches: isUneditedDemo, after: -Infinity } };
  }
  const since = Date.parse(lastSyncedAt);
  if (now.getTime() - since > KEEP_DAYS * 86_400_000) {
    return { cursor: null, dropMissing: { matches: (t) => lastEdited(t) < since, after: since } };
  }
  return { cursor };
}

/**
 * One full sync. `dropMissing` applies when reading every file (a null cursor) and at least
 * one counts: the local tasks it matches that none of them has are deleted outright, not
 * tombstoned. `tidy` first clears out other devices' stale files, so they aren't read.
 */
export async function syncWith(
  backend: SyncBackend,
  state: SyncState,
  { dropMissing, tidy = false }: { dropMissing?: DropMissing; tidy?: boolean } = {},
): Promise<SyncState & { pushed: boolean }> {
  // Swept away as stale while this device was away, or removed by hand: write it again
  let pushedKey = state.pushedKey;
  if (tidy && !(await backend.removeStale(KEEP_DAYS * 86_400_000)).hasOwnFile) pushedKey = null;

  const { files, cursor } = await backend.pull(state.cursor);
  const data = files.map((f) => ({ ...f, data: parseDataFile(f.json) }));
  if (data.length) await importData(combine(data.map((f) => f.data)));

  const witnesses = data.filter((f) => dropMissing && f.modifiedAt > dropMissing.after);
  if (dropMissing && state.cursor === null && witnesses.length) {
    const ids = new Set(witnesses.flatMap((f) => f.data.tasks.map((t) => t.id)));
    await db.tasks.filter((t) => dropMissing.matches(t) && !ids.has(t.id)).delete();
  }

  const local = await exportData();
  const key = await contentKey(local);
  if (key === pushedKey) return { cursor, pushedKey, pushed: false };
  await backend.push(JSON.stringify(local));
  return { cursor, pushedKey: key, pushed: true };
}
