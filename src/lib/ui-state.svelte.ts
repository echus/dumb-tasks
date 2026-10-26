// Small pieces of app-wide UI state shared between components.

/** Today's date, refreshed when the app comes back into view, so "x days left" stays right. */
export const clock = $state({ now: new Date() });

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') clock.now = new Date();
  });
  setInterval(() => (clock.now = new Date()), 10 * 60_000);
}

export interface Toast {
  message: string;
  undo?: () => void;
}

export const toast = $state<{ current: Toast | null }>({ current: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, undo?: () => void) {
  clearTimeout(timer);
  toast.current = { message, undo };
  timer = setTimeout(() => (toast.current = null), 5000);
}

export function dismissToast() {
  clearTimeout(timer);
  toast.current = null;
}

/** The task being dragged between buckets (desktop only). */
export const drag = $state<{ id: string | null }>({ id: null });
