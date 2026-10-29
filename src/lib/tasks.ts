import { generateKeyBetween } from 'fractional-indexing';
import { ulid } from 'ulid';
import { db } from './db';
import { parseDeadline } from './deadline';
import { guessIcon } from './guess-icon';
import { pickCircleColour } from './task-icons';
import { MERGED_FIELDS, type MergedField } from './merge';
import { localChanged } from './sync';
import { BUCKETS, makeDeadline, type Bucket, type Task } from './types';

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

/**
 * The merge timestamp for an edit: now, or just after the task's last edit if that came
 * from a device whose clock is ahead. Either way an edit made after seeing another wins.
 */
function editStamp(task: Task, now: Date): string {
  const last = Math.max(...Object.values(task.fieldUpdatedAt).map(Date.parse));
  return new Date(Math.max(now.getTime(), last + 1)).toISOString();
}

/** Every write goes through here so each changed field gets a merge timestamp. */
async function updateTask(id: string, patch: Partial<Pick<Task, MergedField>>, now = new Date()) {
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
function derive(text: string, now: Date, dismissed: string[] = []): Pick<Task, 'deadline' | 'icon'> {
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
  localChanged();
  return id;
}

// Shown on a first visit, to show off deadlines, icons and dragging. Fixed ids and
// timestamps, so the copies two new devices add merge into one, and anything the user does
// to them wins. All in Today, so phones show them without switching tabs. Icons and colours
// are picked by hand: hues far apart, each far from its icon's own colours.
const DEMO_AT = '2000-01-01T00:00:00.000Z';
const DEMO_TASKS: { text: string; icon: string; colour: string }[] = [
  { text: 'Drag me to another list', icon: '👉', colour: 'hsl(260 100% 60%)' },
  { text: 'Sync me with Google Drive', icon: '🔄', colour: 'hsl(50 100% 52%)' },
  { text: 'Add some tasks today', icon: '📝', colour: 'hsl(310 100% 60%)' },
  { text: 'Repot plants by end of next month', icon: '🪴', colour: 'hsl(205 100% 55%)' },
];
const demoId = (i: number) => `00000000000000000000DEM${String(i + 1).padStart(3, '0')}`;
const DEMOS = new Map(DEMO_TASKS.map((demo, i) => [demoId(i), demo]));

export function isDemoTask(t: Task): boolean {
  return DEMOS.has(t.id);
}

/** A demo task the user hasn't retyped: moving or completing it is still just trying it out. */
export function isUneditedDemo(t: Task): boolean {
  return unedited(t) !== undefined;
}

/** A demo task's hand-picked icon and colour, until its text is edited. */
function unedited(t: Task): { icon: string; colour: string } | undefined {
  const demo = DEMOS.get(t.id);
  return demo?.text === t.text ? demo : undefined;
}

/**
 * Once per device, on a first visit (no tasks, Drive not connected). Deadlines are read
 * from today, so they're real dates from then on.
 */
export async function addDemoTasks(now = new Date()) {
  await db.transaction('rw', db.tasks, db.settings, async () => {
    if (await db.settings.get('demo')) return;
    await db.settings.put({ key: 'demo', value: '1' });
    if ((await db.tasks.count()) > 0 || (await db.settings.get('drive'))) return;

    let position: string | null = null;
    for (const [i, { text, icon, colour }] of DEMO_TASKS.entries()) {
      position = generateKeyBetween(position, null);
      const fields = {
        text,
        bucket: 'today' as const,
        position,
        sorted: false,
        completedAt: null,
        deletedAt: null,
        aiNote: '',
        dismissedPhrases: [],
        ...derive(text, now),
        icon,
        colour,
      };
      await db.tasks.add({
        id: demoId(i),
        createdAt: DEMO_AT,
        bucketHistory: [{ bucket: 'today', at: DEMO_AT }],
        fieldUpdatedAt: Object.fromEntries(Object.keys(fields).map((k) => [k, DEMO_AT])),
        ...fields,
      });
    }
  });
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

/** The same numbers from the same seed every time (mulberry32, seeded by a string hash). */
function seededRandom(seed: string): () => number {
  let a = 0;
  for (const ch of seed) a = Math.imul(a ^ ch.charCodeAt(0), 2654435761);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Re-guesses every open task's icon and re-picks its colour under the current rules, top
 * to bottom so neighbours differ (unedited demo tasks keep theirs). Seeded by task id, so
 * every device that runs it on the same lists gets the same colours, and running it again
 * changes nothing.
 */
export async function refreshColours(now = new Date()) {
  await db.transaction('rw', db.tasks, async () => {
    for (const bucket of BUCKETS) {
      let above: string | null = null;
      for (const task of await activeIn(bucket)) {
        const demo = unedited(task);
        const icon = demo?.icon ?? guessIcon(task.text);
        const colour: string =
          demo?.colour ?? pickCircleColour(icon, above ? [above] : [], seededRandom(task.id));
        above = colour;
        if (icon !== task.icon || colour !== task.colour) await updateTask(task.id, { icon, colour }, now);
      }
    }
  });
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

export async function completeTask(id: string, now = new Date()) {
  await updateTask(id, { completedAt: now.toISOString() }, now);
}

export async function deleteTask(id: string, now = new Date()) {
  await updateTask(id, { deletedAt: now.toISOString() }, now);
}

/**
 * Puts a task's fields back to a saved copy, or tombstones it if there was no copy (it
 * didn't exist yet). Written as a fresh edit, so sync treats an undo like any other change.
 */
export async function applySnapshot(id: string, snapshot: Task | undefined, now = new Date()) {
  const current = await db.tasks.get(id);
  if (!current) return;
  const target: Task = snapshot ?? { ...current, deletedAt: now.toISOString() };
  const patch: Partial<Pick<Task, MergedField>> = {};
  for (const field of MERGED_FIELDS) {
    if (JSON.stringify(current[field]) !== JSON.stringify(target[field])) {
      Object.assign(patch, { [field]: target[field] });
    }
  }
  if (Object.keys(patch).length) await updateTask(id, patch, now);
}
