import type { Bucket } from './types';

// Small pieces of app-wide UI state shared between components.

/** Today's date, refreshed when the app comes back into view, so "x days left" stays right. */
export const clock = $state({ now: new Date() });

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') clock.now = new Date();
  });
  setInterval(() => (clock.now = new Date()), 10 * 60_000);
}

/**
 * A task being dragged between and within buckets (see dnd.ts). Kept in one place so every
 * highlight clears the moment a drag ends, wherever it ends.
 */
export const drag = $state<{
  id: string | null; // task being dragged
  overTab: Bucket | null; // phone tab under the pointer: drops go to the end of that list
}>({ id: null, overTab: null });

export function endDrag() {
  drag.id = null;
  drag.overTab = null;
}
