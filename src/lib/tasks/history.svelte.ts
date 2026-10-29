import { db } from '../db';
import { MERGED_FIELDS } from '../sync/merge';
import { applySnapshot } from './tasks';
import type { Task } from '../types';

// Undo/redo for this session: each step remembers how the tasks it touched looked
// before and after, and undo/redo write those copies back.

interface Change {
  id: string;
  before: Task | undefined; // undefined: the task didn't exist yet
  after: Task | undefined;
}

const LIMIT = 100;
const undoStack: Change[][] = [];
const redoStack: Change[][] = [];

export const history = $state({ canUndo: false, canRedo: false });

// Only the user-visible fields count; merge timestamps change even on a no-op save.
function same(a: Task | undefined, b: Task | undefined): boolean {
  if (!a || !b) return a === b;
  return MERGED_FIELDS.every((f) => JSON.stringify(a[f]) === JSON.stringify(b[f]));
}

function refresh() {
  history.canUndo = undoStack.length > 0;
  history.canRedo = redoStack.length > 0;
}

/**
 * Runs a task action and records it as one undo step. `ids` are the tasks it touches;
 * pass null when the action creates a task and returns its id.
 */
export async function track<T>(ids: string[] | null, action: () => Promise<T>): Promise<T> {
  const before = ids ? await db.tasks.bulkGet(ids) : [];
  const result = await action();
  const touched = ids ?? (typeof result === 'string' ? [result] : []);
  const after = await db.tasks.bulkGet(touched);

  const changes = touched
    .map((id, i) => ({ id, before: ids ? before[i] : undefined, after: after[i] }))
    .filter((c) => !same(c.before, c.after));
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
  for (const c of step) await applySnapshot(c.id, c.before);
  redoStack.push(step);
  refresh();
}

export async function redo() {
  const step = redoStack.pop();
  if (!step) return;
  for (const c of step) await applySnapshot(c.id, c.after);
  undoStack.push(step);
  refresh();
}
