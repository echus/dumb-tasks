import type { Bucket } from '../types';

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
 * A task being dragged between and within buckets (see drag-and-drop.ts). Kept in one place so every
 * highlight clears the moment a drag ends, wherever it ends.
 */
export const drag = $state<{
  id: string | null; // task being dragged
  overTab: Bucket | null; // phone tab under the pointer: drops go to the end of that list
}>({ id: null, overTab: null });

/**
 * The sync menu: open from its button, or from the install pill, which also asks it to point
 * out the install steps.
 */
export const menu = $state<{ open: boolean; highlight: 'install' | null }>({ open: false, highlight: null });

/** Whether the tasks done today show, in every list. Open unless closed on this device. */
export const doneRows = $state({ open: savedDoneOpen() });

function savedDoneOpen(): boolean {
  try {
    return localStorage.getItem('done-rows') !== 'closed';
  } catch {
    return true; // Storage blocked: open
  }
}

export function toggleDoneRows() {
  doneRows.open = !doneRows.open;
  try {
    localStorage.setItem('done-rows', doneRows.open ? 'open' : 'closed');
  } catch {
    // Not kept; it still toggles
  }
}

export function endDrag() {
  drag.id = null;
  drag.overTab = null;
}
