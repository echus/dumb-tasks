import { generateKeyBetween } from 'fractional-indexing';
import { db } from '../db';
import type { Task } from '../types';
import { derive } from './tasks';

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
export function unedited(t: Task): { icon: string; colour: string } | undefined {
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
