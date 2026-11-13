import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { ulid } from 'ulid';
import { db } from '../db';
import { localChanged } from '../sync/local-changes';
import { MERGED_FIELDS, type MergedField } from '../sync/merge';
import { makeDeadline, type Bucket, type Task } from '../types';
import { pickCircleColour } from './circle-colours';
import { parseDeadline } from './deadline';
import { guessIcon } from './guess-icon';

export function isActive(t: Task): boolean {
  return t.deletedAt === null && t.completedAt === null;
}

export function byPosition(a: Task, b: Task): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : a.id.localeCompare(b.id);
}

export async function activeIn(bucket: Bucket): Promise<Task[]> {
  const tasks = await db.tasks.where('bucket').equals(bucket).toArray();
  return tasks.filter(isActive).sort(byPosition);
}

/**
 * The merge timestamp for an edit: now, or just after the task's last edit if that came
 * from a device whose clock is ahead. Either way an edit made after seeing another wins.
 */
function editStamp(task: Task, now: Date): string {
  return new Date(Math.max(now.getTime(), lastEdited(task) + 1)).toISOString();
}

/** When any of a task's fields last changed, in ms. */
export function lastEdited(task: Task): number {
  return Math.max(...Object.values(task.fieldUpdatedAt).map(Date.parse).filter(Number.isFinite));
}

/** Every write goes through here so each changed field gets a merge timestamp. */
export async function updateTask(id: string, patch: Partial<Pick<Task, MergedField>>, now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    const at = editStamp(task, now);
    const fieldUpdatedAt = { ...task.fieldUpdatedAt };
    for (const key of Object.keys(patch)) fieldUpdatedAt[key] = at;
    const bucketHistory =
      patch.bucket && patch.bucket !== task.bucket
        ? [...task.bucketHistory, { bucket: patch.bucket, at }]
        : task.bucketHistory;
    await db.tasks.put({ ...task, ...patch, fieldUpdatedAt, bucketHistory });
  });
  localChanged();
}

/** Fields derived from the text: re-run whenever the user writes or edits it. */
export function derive(text: string, now: Date, dismissed: string[] = []): Pick<Task, 'deadline' | 'icon'> {
  const deadline = parseDeadline(text, now, undefined, dismissed);
  return {
    deadline: deadline && makeDeadline(deadline.date, deadline.phrase),
    icon: guessIcon(text),
  };
}

/** New tasks land at the top of their bucket (Today unless given). */
export async function addTask(
  text: string,
  now = new Date(),
  bucket: Bucket = 'today',
): Promise<string | null> {
  text = text.trim();
  if (!text) return null;

  const at = now.toISOString();
  const id = ulid(now.getTime());
  const derived = derive(text, now);

  // In a transaction so rapid adds don't read the same "first" and collide on position.
  await db.transaction('rw', db.tasks, async () => {
    const first = (await activeIn(bucket))[0];
    const fields = {
      text,
      bucket,
      position: generateKeyBetween(null, first?.position ?? null),
      sorted: false,
      completedAt: null,
      deletedAt: null,
      aiNote: '',
      dismissedPhrases: [],
      ...derived,
      // Clearly different from the task it lands above
      colour: pickCircleColour(derived.icon, first ? [first.colour] : []),
    };
    await db.tasks.add({
      id,
      createdAt: at,
      bucketHistory: [{ bucket, at }],
      fieldUpdatedAt: Object.fromEntries(Object.keys(fields).map((k) => [k, at])),
      ...fields,
    });
  });
  localChanged(true);
  return id;
}

export async function editText(id: string, text: string, now = new Date()) {
  text = text.trim();
  if (!text) return;
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    const derived = derive(text, now, task.dismissedPhrases);
    // A new icon gets a new colour, so the change is easy to spot.
    const colour = derived.icon === task.icon ? {} : { colour: pickCircleColour(derived.icon) };
    await updateTask(id, { text, ...derived, ...colour }, now);
  });
}

/** Drops a deadline that was read wrongly; it stays gone when the text is edited. */
export async function dismissDeadline(id: string, now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task?.deadline) return;
    const phrase = task.deadline.phrase;
    const dismissed = task.dismissedPhrases ?? [];
    await updateTask(
      id,
      { deadline: null, ...(phrase && { dismissedPhrases: [...dismissed, phrase] }) },
      now,
    );
  });
}

/**
 * Moves a task into `bucket`, just before `beforeId` (or to the end if null).
 * Any deliberate move — even within the same bucket — counts as sorting it.
 */
export async function moveTask(id: string, bucket: Bucket, beforeId: string | null, now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    const siblings = (await activeIn(bucket)).filter((t) => t.id !== id);
    const found = beforeId ? siblings.findIndex((t) => t.id === beforeId) : -1;
    const i = found >= 0 ? found : siblings.length;
    const after = siblings[i - 1]?.position ?? null;
    const before = siblings[i]?.position ?? null;
    if (after === null || before === null || after < before) {
      const position = generateKeyBetween(after, before);
      await updateTask(id, { bucket, position, sorted: true }, now);
      return;
    }

    // Two devices can each add a task at the same place, giving both the same position, and
    // no key fits between equal ones. Space out that run of equal positions, with the task in it.
    let start = i - 1;
    while (start > 0 && siblings[start - 1].position === after) start--;
    let end = i;
    while (end < siblings.length && siblings[end].position === after) end++;
    const run = [...siblings.slice(start, i).map((t) => t.id), id, ...siblings.slice(i, end).map((t) => t.id)];
    const keys = generateNKeysBetween(siblings[start - 1]?.position ?? null, siblings[end]?.position ?? null, run.length);
    for (const [k, runId] of run.entries()) {
      await updateTask(runId, runId === id ? { bucket, position: keys[k], sorted: true } : { position: keys[k] }, now);
    }
  });
}

/** Moves a task one place up (-1) or down (1) in its bucket: for the Move menu. */
export async function shiftTask(id: string, by: -1 | 1, now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;
    const siblings = await activeIn(task.bucket);
    const i = siblings.findIndex((t) => t.id === id);
    if (i < 0 || !siblings[i + by]) return;
    // Before the task above it, or before the one after the task below it
    const before = by < 0 ? siblings[i - 1] : siblings[i + 2];
    await moveTask(id, task.bucket, before?.id ?? null, now);
  });
}

export async function completeTask(id: string, now = new Date()) {
  await updateTask(id, { completedAt: now.toISOString() }, now);
}

export async function deleteTask(id: string, now = new Date()) {
  await updateTask(id, { deletedAt: now.toISOString() }, now);
}

/**
 * Puts `fields` of a task back to a saved copy, or tombstones it if there was no copy (it
 * didn't exist yet). Written as a fresh edit, so sync treats an undo like any other change.
 */
export async function applySnapshot(
  id: string,
  snapshot: Task | undefined,
  fields: readonly MergedField[] = MERGED_FIELDS,
  now = new Date(),
) {
  const current = await db.tasks.get(id);
  if (!current) return;
  const target: Task = snapshot ?? { ...current, deletedAt: now.toISOString() };
  const patch: Partial<Pick<Task, MergedField>> = {};
  for (const field of fields) {
    if (JSON.stringify(current[field]) !== JSON.stringify(target[field])) {
      Object.assign(patch, { [field]: target[field] });
    }
  }
  if (Object.keys(patch).length) await updateTask(id, patch, now);
}
