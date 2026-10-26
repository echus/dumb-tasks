import { db } from './db';
import { mergeTask } from './merge';
import { SCHEMA_VERSION, type DataFile, type Task } from './types';

const EPOCH = new Date(0).toISOString();

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

/** Merges a backup into local data the same way sync will: newest edit per field wins. */
export async function importData(data: DataFile): Promise<{ added: number; merged: number }> {
  let added = 0;
  let merged = 0;
  await db.transaction('rw', db.tasks, db.meta, async () => {
    const existing = new Map((await db.tasks.toArray()).map((t) => [t.id, t]));
    const out: Task[] = [];
    for (const incoming of data.tasks) {
      const local = existing.get(incoming.id);
      if (local) merged++;
      else added++;
      out.push(local ? mergeTask(local, incoming) : incoming);
    }
    await db.tasks.bulkPut(out);

    const memory = await db.meta.get('memory');
    if (!memory || data.memoryUpdatedAt > memory.updatedAt) {
      await db.meta.put({ key: 'memory', value: data.memory, updatedAt: data.memoryUpdatedAt });
    }
  });
  return { added, merged };
}
