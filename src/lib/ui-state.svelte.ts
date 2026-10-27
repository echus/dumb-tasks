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
 * Drag-and-drop between and within buckets, by mouse or (long-press) touch. Kept in one
 * place so every highlight clears the moment a drag ends, wherever it ends.
 */
export const drag = $state<{
  id: string | null; // task being dragged
  label: string; // its text, for the touch drag preview
  bucket: Bucket | null; // list (or tab) under the pointer
  overTask: string | null; // task under the pointer, if any
  after: boolean; // pointer is in the lower half of that task
  overTab: Bucket | null; // phone tab under the pointer: drops go to the end of that list
  touch: boolean; // a touch drag, which draws its own preview
  x: number;
  y: number;
}>({ id: null, label: '', bucket: null, overTask: null, after: false, overTab: null, touch: false, x: 0, y: 0 });

export function endDrag() {
  drag.id = null;
  drag.bucket = null;
  drag.overTask = null;
  drag.overTab = null;
  drag.touch = false;
}
