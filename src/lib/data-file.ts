import { db } from './db';
import { mergeTask } from './merge';
import { SCHEMA_VERSION, type DataFile, type Task } from './types';

const EPOCH = new Date(0).toISOString();

// Deleted and completed tasks stay so the change reaches every device, then go for good:
// by then every device should have synced. One offline for longer brings the task back.
const KEEP_DAYS = 90;

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

export function parseDataFile(json: string): DataFile {
  const data = JSON.parse(json) as Partial<DataFile>;
  if (typeof data.schemaVersion !== 'number' || !Array.isArray(data.tasks)) {
    throw new Error("This doesn't look like a Dumb Tasks backup.");
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This backup is from a newer version of Dumb Tasks.');
  }
  return {
    schemaVersion: data.schemaVersion,
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
