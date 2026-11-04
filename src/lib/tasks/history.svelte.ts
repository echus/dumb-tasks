import { db } from '../db';
import { MERGED_FIELDS, type MergedField } from '../sync/merge';
import { activeIn, applySnapshot } from './tasks';
import type { Bucket, Task } from '../types';

// Undo/redo for this session: each step remembers how the tasks it touched looked
// before and after, and undo/redo write back only the fields it changed. A change made
// since to another field, here or on another device, stays.

interface Change {
  id: string;
  before: Task | undefined; // undefined: the task didn't exist yet
  after: Task | undefined;
  fields: MergedField[];
}

const LIMIT = 100;
const undoStack: Change[][] = [];
const redoStack: Change[][] = [];

export const history = $state({ canUndo: false, canRedo: false });

// Only the user-visible fields count; merge timestamps change even on a no-op save. A task
// that didn't exist before is undone by deleting it.
function changed(a: Task | undefined, b: Task | undefined): MergedField[] {
  if (!a || !b) return a === b ? [] : ['deletedAt'];
  return MERGED_FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
}

function refresh() {
  history.canUndo = undoStack.length > 0;
  history.canRedo = redoStack.length > 0;
}

/**
 * Runs a task action and records it as one undo step. `ids` are the tasks it touches;
 * pass null when the action creates a task and returns its id. The action runs inside a
 * database transaction (see record), so it may only wait on the database: a fetch or a
 * timer inside it ends the transaction early, and Dexie throws PrematureCommitError.
 */
export function track<T>(ids: string[] | null, action: () => Promise<T>): Promise<T> {
  return record(async () => ids, action);
}

/**
 * Records a move into `bucket` as one undo step, with the tasks it lands among: making room
 * for it can move them too (see moveTask).
 */
export function trackMove(id: string, bucket: Bucket, action: () => Promise<void>): Promise<void> {
  const among = async () => (await activeIn(bucket)).map((t) => t.id).filter((other) => other !== id);
  return record(async () => [id, ...(await among())], action);
}

async function record<T>(listIds: () => Promise<string[] | null>, action: () => Promise<T>): Promise<T> {
  // All in one transaction, so a change made meanwhile (by sync, or in another tab) isn't
  // taken for the action's own and undone with it
  const { result, changes } = await db.transaction('rw', db.tasks, async () => {
    const ids = await listIds();
    const before = ids ? await db.tasks.bulkGet(ids) : [];
    const result = await action();
    const touched = ids ?? (typeof result === 'string' ? [result] : []);
    const after = await db.tasks.bulkGet(touched);
    const changes = touched
      .map((id, i) => {
        const was = ids ? before[i] : undefined;
        return { id, before: was, after: after[i], fields: changed(was, after[i]) };
      })
      .filter((c) => c.fields.length);
    return { result, changes };
  });
  if (changes.length) {
    undoStack.push(changes);
    if (undoStack.length > LIMIT) undoStack.shift();
    redoStack.length = 0;
    refresh();
  }
  return result;
}

export async function undo() {
  const step = undoStack.pop();
  if (!step) return;
  for (const c of step) await applySnapshot(c.id, c.before, c.fields);
  redoStack.push(step);
  refresh();
}

export async function redo() {
  const step = redoStack.pop();
  if (!step) return;
  for (const c of step) await applySnapshot(c.id, c.after, c.fields);
  undoStack.push(step);
  refresh();
}
