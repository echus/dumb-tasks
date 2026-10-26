import { generateKeyBetween } from 'fractional-indexing';
import { ulid } from 'ulid';
import { db } from './db';
import { parseDeadline } from './deadline';
import { guessIcon } from './guess-icon';
import type { MergedField } from './merge';
import type { Bucket, Task } from './types';

export function isActive(t: Task): boolean {
  return t.deletedAt === null && t.completedAt === null;
}

export function byPosition(a: Task, b: Task): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : a.id.localeCompare(b.id);
}

async function activeIn(bucket: Bucket): Promise<Task[]> {
  const tasks = await db.tasks.where('bucket').equals(bucket).toArray();
  return tasks.filter(isActive).sort(byPosition);
}

/** Every write goes through here so each changed field gets a merge timestamp. */
async function updateTask(id: string, patch: Partial<Pick<Task, MergedField>>, now = new Date()) {
  const at = now.toISOString();
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    const fieldUpdatedAt = { ...task.fieldUpdatedAt };
    for (const key of Object.keys(patch)) fieldUpdatedAt[key] = at;
    const bucketHistory =
      patch.bucket && patch.bucket !== task.bucket
        ? [...task.bucketHistory, { bucket: patch.bucket, at }]
        : task.bucketHistory;
    await db.tasks.put({ ...task, ...patch, fieldUpdatedAt, bucketHistory });
  });
}

/** Fields derived from the text: re-run whenever the user writes or edits it. */
function derive(text: string, now: Date) {
  const deadline = parseDeadline(text, now);
  const icon = guessIcon(text);
  return {
    deadline: deadline?.date ?? null,
    deadlineText: deadline?.text ?? null,
    deadlineSource: deadline ? ('parsed' as const) : null,
    icon: icon?.icon ?? null,
    category: icon?.category ?? null,
    iconSource: 'auto' as const,
  };
}

/** New tasks land at the top of Today. */
export async function addTask(text: string, now = new Date()): Promise<string | null> {
  text = text.trim();
  if (!text) return null;

  const at = now.toISOString();
  const id = ulid(now.getTime());
  const derived = derive(text, now);

  // In a transaction so rapid adds don't read the same "first" and collide on position.
  await db.transaction('rw', db.tasks, async () => {
    const first = (await activeIn('today'))[0];
    const fields = {
      text,
      bucket: 'today' as const,
      position: generateKeyBetween(null, first?.position ?? null),
      sorted: false,
      completedAt: null,
      deletedAt: null,
      aiNote: '',
      ...derived,
    };
    await db.tasks.add({
      id,
      createdAt: at,
      bucketHistory: [{ bucket: 'today', at }],
      fieldUpdatedAt: Object.fromEntries(Object.keys(fields).map((k) => [k, at])),
      ...fields,
    });
  });
  return id;
}

export async function editText(id: string, text: string, now = new Date()) {
  text = text.trim();
  if (!text) return;
  await updateTask(id, { text, ...derive(text, now) }, now);
}

/**
 * Moves a task into `bucket`, just before `beforeId` (or to the end if null).
 * Any deliberate move — even within the same bucket — counts as sorting it.
 */
export async function moveTask(id: string, bucket: Bucket, beforeId: string | null, now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    const siblings = (await activeIn(bucket)).filter((t) => t.id !== id);
    const i = beforeId ? siblings.findIndex((t) => t.id === beforeId) : -1;
    const before = i >= 0 ? siblings[i] : null;
    const after = i >= 0 ? (siblings[i - 1] ?? null) : (siblings.at(-1) ?? null);
    const position = generateKeyBetween(after?.position ?? null, before?.position ?? null);

    await updateTask(id, { bucket, position, sorted: true }, now);
  });
}

/** Moves a task to the top of another bucket — what the tap menu does. */
export async function sendTo(id: string, bucket: Bucket, now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    const first = (await activeIn(bucket)).find((t) => t.id !== id);
    await moveTask(id, bucket, first?.id ?? null, now);
  });
}

/** Clears the "new" marker without moving the task. */
export async function keepHere(id: string, now = new Date()) {
  await updateTask(id, { sorted: true }, now);
}

export async function completeTask(id: string, now = new Date()) {
  await updateTask(id, { completedAt: now.toISOString() }, now);
}

export async function uncompleteTask(id: string, now = new Date()) {
  await updateTask(id, { completedAt: null }, now);
}

export async function deleteTask(id: string, now = new Date()) {
  await updateTask(id, { deletedAt: now.toISOString() }, now);
}

export async function restoreTask(id: string, now = new Date()) {
  await updateTask(id, { deletedAt: null }, now);
}
