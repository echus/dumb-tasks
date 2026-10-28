import Dexie, { type EntityTable } from 'dexie';
import type { Meta, Task } from './types';

// `meta` is synced data that isn't a task (e.g. the AI's memory of the user).
// `settings` is device-only and never exported or synced.
export const db = new Dexie('dumb-tasks') as Dexie & {
  tasks: EntityTable<Task, 'id'>;
  meta: EntityTable<Meta, 'key'>;
  settings: EntityTable<{ key: string; value: string }, 'key'>;
};

// Installed apps have this data, so never edit a version once it's released. To change the
// tables or the shape of what's stored, add db.version(2).stores(...) with an .upgrade()
// that brings existing rows up to date. A change to Task also needs a step in data-file.ts,
// for backups and the synced file.
db.version(1).stores({
  tasks: 'id, bucket',
  meta: 'key',
  settings: 'key',
});

/**
 * Whether a newer version of the app (say, in another tab) has upgraded the database. Dexie
 * would open it anyway, but this copy mustn't touch it: it would write tasks in the old shape.
 */
export async function isDatabaseNewer(): Promise<boolean> {
  await db.open();
  return db.backendDB().version / 10 > db.verno; // Dexie stores its version times ten
}
