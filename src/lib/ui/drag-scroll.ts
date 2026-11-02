// Scrolling while a task is dragged near the top or bottom of its list (see drag-and-drop.ts)

const EDGE = 56; // this close to the top or bottom of a list's view scrolls it
const MAX_SPEED = 14; // scrolling right at the edge, in px per frame

/** The list's own scroll box (wide screens), or null when the page scrolls instead (phones). */
function scrollerOf(ul: HTMLElement | null): HTMLElement | null {
  const box = ul?.closest<HTMLElement>('.scroll');
  return box && getComputedStyle(box).overflowY !== 'visible' ? box : null;
}

/** Scroll speed for a pointer at `y`: faster the closer it is to the top or bottom edge. */
function edgeSpeed(scroller: HTMLElement | null, y: number): number {
  let top = 0;
  let bottom = window.innerHeight;
  if (scroller) ({ top, bottom } = scroller.getBoundingClientRect());
  else {
    // The page scrolls under the sticky tab bar, so its top edge is the bar's bottom
    const tabs = document.querySelector('[role="tablist"]')?.getBoundingClientRect();
    if (tabs) top = Math.max(0, tabs.bottom);
  }
  let speed = 0;
  if (y < top) speed = 0; // over the tabs: those are for dropping on
  else if (y < top + EDGE) speed = -MAX_SPEED * (1 - (y - top) / EDGE);
  else if (y > bottom - EDGE) speed = MAX_SPEED * Math.min(1, 1 - (bottom - y) / EDGE);
  return Math.sign(speed) * Math.ceil(Math.abs(speed)); // whole pixels, or the page may not move
}

/**
 * One frame's scroll, for a pointer at `y` over the list `ul` (or a hidden list's tab, null).
 * Returns whether it scrolled, so the rows under the pointer have changed.
 */
export function scrollNearEdge(ul: HTMLElement | null, y: number): boolean {
  const scroller = scrollerOf(ul);
  const speed = edgeSpeed(scroller, y);
  if (speed) (scroller ?? window).scrollBy(0, speed);
  return speed !== 0;
}
