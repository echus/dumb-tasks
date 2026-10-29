// Task writes call localChanged() so sync can push them soon after. A listener rather than a
// direct call keeps task code free of network code.
let listener: () => void = () => {};

export function onLocalChange(fn: () => void) {
  listener = fn;
}

export function localChanged() {
  listener();
}
