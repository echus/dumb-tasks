// The done history has its own address, so the system back button (Android, or the
// browser's) steps back through it rather than leaving the app:
//   #done              opens on today
//   #done/2026-11-17   a day picked on the calendar
//   #done/2026-11      a whole month

const PATTERN = /^#done(?:\/(\d{4}-\d{2}(?:-\d{2})?))?$/;

function read(): { open: boolean; target: string | null } {
  const match = typeof location !== 'undefined' ? PATTERN.exec(location.hash) : null;
  return { open: match !== null, target: match?.[1] ?? null };
}

export const doneView = $state(read());

// How many steps the history added to the browser's, which leaving it takes back: one for
// opening it, and one more once something other than today is picked. Later picks replace
// that step, so back doesn't walk through every day tapped.
let steps = 0;

if (typeof window !== 'undefined') {
  addEventListener('hashchange', () => {
    Object.assign(doneView, read());
    if (!doneView.open) steps = 0;
    else if (doneView.target === null) steps = Math.min(steps, 1);
  });
}

export function openDoneView() {
  if (doneView.open) return;
  steps = 1;
  location.hash = 'done';
  scrollTo(0, 0);
}

/** Shows a day (YYYY-MM-DD) or a month (YYYY-MM), or today with null. */
export function showDone(target: string | null) {
  if (target === doneView.target) return;
  const hash = target ? `#done/${target}` : '#done';
  if (target === null && steps > 1) {
    // Back to today: take the extra step off, so back from here leaves the history
    history.back();
  } else if (doneView.target === null && target !== null && steps > 0) {
    steps++;
    location.hash = hash;
  } else {
    history.replaceState(null, '', hash);
    doneView.target = target;
  }
}

export function closeDoneView() {
  if (!doneView.open) return;
  if (steps > 0) {
    history.go(-steps);
  } else {
    // Opened straight at #done: there's no step to go back to
    history.replaceState(null, '', location.pathname + location.search);
    Object.assign(doneView, { open: false, target: null });
  }
}
