import { db } from '../db';
import type { DataFile, Task } from '../types';
import { mergeTask } from './merge';

const EPOCH = new Date(0).toISOString();

// Backups and the synced files are versioned. Each step upgrades a file by one version, so
// MIGRATIONS[0] takes version 1 to 2 and adding a step bumps SCHEMA_VERSION. Add one for any
// change to the file's or a task's shape, even a new optional field: an older app merging a
// newer file would drop fields it doesn't know (see mergeTask), so instead it refuses the
// file until it's updated. Old devices keep sending files in the old shape until then, and
// a step may meet data already in the new shape, so it has to handle both.
// A change to Task also needs a database upgrade in db.ts, for the tasks already stored.
type Migration = (data: any) => void; // older shapes have no types
const MIGRATIONS: Migration[] = [];
export const SCHEMA_VERSION = MIGRATIONS.length + 1;

/** The file is from a newer version of the app, so this one can't merge it safely. */
export class NewerVersionError extends Error {
  constructor() {
    super('This backup is from a newer version of Dumb Tasks. Reload the app to update it. Then try again.');
  }
}

// Deleted and completed tasks stay so the change reaches every device, then go for good:
// by then every device should have synced. One offline for longer brings the task back.
export const KEEP_DAYS = 90;

/** Everything that would sync, including completed tasks and tombstones. */
export async function exportData(now = new Date()): Promise<DataFile> {
  const [tasks, memory] = await Promise.all([db.tasks.toArray(), db.meta.get('memory')]);
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    tasks,
    memory: memory?.value ?? '',
    memoryUpdatedAt: memory?.updatedAt ?? EPOCH,
  };
}

/** Reads a backup or synced file, upgraded to this version's shape. */
export function parseDataFile(json: string): DataFile {
  const data = JSON.parse(json) as Partial<DataFile> | null;
  const version = data?.schemaVersion ?? 0;
  if (!data || !Number.isInteger(version) || version < 1 || !Array.isArray(data.tasks)) {
    throw new Error('This file is not a Dumb Tasks backup.');
  }
  if (version > SCHEMA_VERSION) throw new NewerVersionError();
  for (let v = version; v < SCHEMA_VERSION; v++) MIGRATIONS[v - 1](data);
  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: data.exportedAt ?? EPOCH,
    tasks: data.tasks,
    memory: data.memory ?? '',
    memoryUpdatedAt: data.memoryUpdatedAt ?? EPOCH,
  };
}

/** Removes tasks deleted or completed more than KEEP_DAYS ago. */
export async function dropOldTasks(now = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString();
  const old = (at: string | null) => at !== null && at < cutoff;
  await db.tasks.filter((t) => old(t.deletedAt) || old(t.completedAt)).delete();
}

/**
 * Merges a backup into local data the same way sync will: newest edit per field wins. Then
 * drops old deleted and completed tasks, from either side, so sync pushes a file without
 * them.
 */
export async function importData(
  data: DataFile,
  now = new Date(),
): Promise<{ added: number; merged: number }> {
  let added = 0;
  let merged = 0;
  await db.transaction('rw', db.tasks, db.meta, async () => {
    const existing = new Map((await db.tasks.toArray()).map((t) => [t.id, t]));
    const out: Task[] = [];
    for (const incoming of data.tasks) {
      const local = existing.get(incoming.id);
      if (!local) {
        added++;
        out.push(incoming);
        continue;
      }
      merged++;
      // Sync imports every task each time; only write the ones that changed.
      const result = mergeTask(local, incoming);
      if (JSON.stringify(result) !== JSON.stringify(local)) out.push(result);
    }
    await db.tasks.bulkPut(out);
    await dropOldTasks(now);

    const memory = await db.meta.get('memory');
    if (!memory || data.memoryUpdatedAt > memory.updatedAt) {
      await db.meta.put({ key: 'memory', value: data.memory, updatedAt: data.memoryUpdatedAt });
    }
  });
  return { added, merged };
}
