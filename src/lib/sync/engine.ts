import { db } from '../db';
import { isUneditedDemo } from '../tasks/demo-tasks';
import type { DataFile, Task } from '../types';
import { exportData, importData, KEEP_DAYS, NewerVersionError, parseDataFile } from './data-file';
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
   * used, whose changes every other file already has. Returns the names of the files it found
   * stale, and whether this device's file is there. Best effort: a file it can't delete stays
   * until the next try, and only a SignedOutError stops the sync.
   */
  removeStale(maxAge: number): Promise<{ stale: string[]; hasOwnFile: boolean }>;
}

/** The backend no longer accepts this device's sign-in: the user needs to sign in again. */
export class SignedOutError extends Error {}

export interface RemoteFile {
  name: string;
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

/** Local tasks to drop when reading every file finds that no other device has them. */
export interface DropMissing {
  matches: (t: Task) => boolean;
}

/**
 * Where a sync starts reading, and which local tasks it drops if no other device has them.
 * A first sync reads everything, and drops the demo tasks for an account's own. One after
 * more than KEEP_DAYS away reads everything again too, rather than trust a cursor that old,
 * but drops nothing: a task another device deleted and has since dropped comes back, which
 * is safer than guessing which tasks the others dropped and deleting one they never had.
 */
export function startFrom(
  lastSyncedAt: string | null,
  cursor: string | null,
  now = new Date(),
): { cursor: string | null; dropMissing?: DropMissing } {
  if (lastSyncedAt === null) return { cursor: null, dropMissing: { matches: isUneditedDemo } };
  if (now.getTime() - Date.parse(lastSyncedAt) > KEEP_DAYS * 86_400_000) return { cursor: null };
  return { cursor };
}

/** Files a sync had to leave out. Everything else still synced. */
export interface Skipped {
  newer: number; // from a newer version of the app, which this one can't merge safely
  unreadable: number; // damaged, or not a data file at all
}

/**
 * One full sync. `dropMissing` applies when reading every file (a null cursor), all of them
 * could be read and at least one counts: the local tasks it matches that none of them has
 * are deleted outright, not tombstoned. `tidy` also clears out other devices' stale files,
 * alongside the pull rather than before it, and leaves them out of what it takes in.
 */
export async function syncWith(
  backend: SyncBackend,
  state: SyncState,
  { dropMissing, tidy = false }: { dropMissing?: DropMissing; tidy?: boolean } = {},
): Promise<SyncState & { pushed: boolean; skipped: Skipped }> {
  const [tidied, { files, cursor: pulled }] = await Promise.all([
    tidy ? backend.removeStale(KEEP_DAYS * 86_400_000) : null,
    backend.pull(state.cursor),
  ]);
  // Swept away as stale while this device was away, or removed by hand: write it again
  const pushedKey = tidied && !tidied.hasOwnFile ? null : state.pushedKey;
  const stale = new Set(tidied?.stale);
  const skipped: Skipped = { newer: 0, unreadable: 0 };
  const data: (RemoteFile & { data: DataFile })[] = [];
  for (const file of files.filter((f) => !stale.has(f.name))) {
    try {
      data.push({ ...file, data: parseDataFile(file.json) });
    } catch (e) {
      if (e instanceof NewerVersionError) skipped.newer++;
      else skipped.unreadable++;
    }
  }
  if (data.length) await importData(combine(data.map((f) => f.data)));
  // Not past a newer version's file, so it's read again once this app has updated
  const cursor = skipped.newer ? state.cursor : pulled;

  // A file left out may hold the very tasks the others lack
  const complete = !skipped.newer && !skipped.unreadable;
  if (dropMissing && state.cursor === null && complete && data.length) {
    const ids = new Set(data.flatMap((f) => f.data.tasks.map((t) => t.id)));
    await db.tasks.filter((t) => dropMissing.matches(t) && !ids.has(t.id)).delete();
  }

  const local = await exportData();
  const key = await contentKey(local);
  if (key === pushedKey) return { cursor, pushedKey, pushed: false, skipped };
  await backend.push(JSON.stringify(local));
  return { cursor, pushedKey: key, pushed: true, skipped };
}
