// Task writes call localChanged() so sync can push them soon after. A listener rather than a
// direct call keeps task code free of network code.
let listener: (now: boolean) => void = () => {};

export function onLocalChange(fn: (now: boolean) => void) {
  listener = fn;
}

/**
 * `now`: push straight away, as for a new task. Otherwise a few seconds later, so edits that
 * come in a quick run, like moves, go in one push.
 */
export function localChanged(now = false) {
  listener(now);
}
