// The view of past done tasks. It has its own address (#done), so the system back button
// (Android, or the browser's) closes it rather than leaving the app.

const atDone = () => typeof location !== 'undefined' && location.hash === '#done';

export const doneView = $state({ open: atDone() });

// Whether opening it added a step to the browser's history, which closing should take back
let pushed = false;

if (typeof window !== 'undefined') {
  addEventListener('hashchange', () => {
    doneView.open = atDone();
    if (!doneView.open) pushed = false;
  });
}

export function openDoneView() {
  if (doneView.open) return;
  pushed = true;
  location.hash = 'done';
  scrollTo(0, 0);
}

export function closeDoneView() {
  if (!doneView.open) return;
  if (pushed) {
    history.back();
  } else {
    // Opened straight at #done: there's no step to go back to
    history.replaceState(null, '', location.pathname + location.search);
    doneView.open = false;
  }
}
