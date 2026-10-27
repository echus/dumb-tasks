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
 * Drag-and-drop between and within buckets (desktop only). Kept in one place so every
 * list's highlight clears the moment a drag ends, wherever it ends.
 */
export const drag = $state<{
  id: string | null; // task being dragged
  bucket: Bucket | null; // list under the pointer
  overTask: string | null; // task under the pointer, if any
  after: boolean; // pointer is in the lower half of that task
}>({ id: null, bucket: null, overTask: null, after: false });

export function endDrag() {
  drag.id = null;
  drag.bucket = null;
  drag.overTask = null;
}
