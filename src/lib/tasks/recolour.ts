import { db } from '../db';
import { BUCKETS } from '../types';
import { pickCircleColour } from './circle-colours';
import { unedited } from './demo-tasks';
import { guessIcon } from './guess-icon';
import { activeIn, updateTask } from './tasks';

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

// Bump to recolour existing tasks again after the colour or icon rules change.
const COLOURS_VERSION = '3'; // ⭐ for unmatched tasks, on any hue

/**
 * After the first sync, once per bump of COLOURS_VERSION: brings older tasks up to the
 * current colour rules. A new device just notes the version: its tasks are new, or came
 * from a device that already ran it.
 */
export async function refreshColoursOnce(): Promise<void> {
  try {
    const seen = localStorage.getItem('colours');
    if (seen === COLOURS_VERSION) return;
    if (seen !== null) await refreshColours();
    localStorage.setItem('colours', COLOURS_VERSION);
  } catch {
    // Storage blocked: skip it rather than recolour on every load.
  }
}
