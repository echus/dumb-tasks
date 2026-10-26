import Dexie, { type EntityTable } from 'dexie';
import type { Meta, Task } from './types';

// `meta` is synced data that isn't a task (e.g. the AI's memory of the user).
// `settings` is device-only and never exported or synced.
export const db = new Dexie('dumb-tasks') as Dexie & {
  tasks: EntityTable<Task, 'id'>;
  meta: EntityTable<Meta, 'key'>;
  settings: EntityTable<{ key: string; value: string }, 'key'>;
};

db.version(1).stores({
  tasks: 'id, bucket',
  meta: 'key',
  settings: 'key',
});
