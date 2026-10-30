import type { Bucket } from '../types';

// Where a dragged task would land, and the rows parting to show it (see drag-and-drop.ts).
// Works on the lists as drawn: each bucket's section is #panel-<bucket>, its tasks the li
// rows of its ul, and its phone tab [data-tab=<bucket>].

/** Where a dragged task would land. */
export interface Target {
  bucket: Bucket;
  ul: HTMLElement | null; // its list, or null for a tab whose list isn't showing (lands at the end)
  slot: number; // how many of the list's other tasks end up above it
}

export const listOf = (bucket: Bucket) => document.querySelector<HTMLElement>(`#panel-${bucket} ul`)!;
const allLists = () => document.querySelectorAll<HTMLElement>('section[id^="panel-"] ul');
export const rowsIn = (ul: HTMLElement) => [...ul.querySelectorAll<HTMLElement>(':scope > li[data-task-id]')];
export const bucketOf = (el: HTMLElement) => el.closest('section')!.id.replace('panel-', '') as Bucket;
const shown = (el: HTMLElement) => el.getClientRects().length > 0; // tabs hide the other lists

/** A row's top within its list. Offsets ignore transforms, so it's where the row sits unshifted. */
const topIn = (ul: HTMLElement, li: HTMLElement) => li.offsetTop - ul.offsetTop;

/** Where the task would land from the spot it was picked up from. */
export function startingTarget(source: HTMLElement): Target {
  const ul = source.closest('ul')!;
  return { bucket: bucketOf(ul), ul, slot: rowsIn(ul).indexOf(source) };
}

/**
 * Where the task would land with the pointer at (x, y) and the task's middle at `middle`,
 * and the tab under the pointer, if any. Null away from every list and tab (the margins,
 * the header).
 */
export function targetAt(
  x: number,
  y: number,
  source: HTMLElement,
  middle: number,
): { target: Target; tab: HTMLElement | null } | null {
  const el = document.elementFromPoint(x, y);
  const tab = el?.closest<HTMLElement>('[data-tab]') ?? null;
  if (tab) {
    // Over a tab: the end of its list
    const bucket = tab.dataset.tab as Bucket;
    const ul = listOf(bucket);
    const target = shown(ul)
      ? { bucket, ul, slot: rowsIn(ul).filter((li) => li !== source).length }
      : { bucket, ul: null, slot: 0 };
    return { target, tab };
  }
  const section = el?.closest<HTMLElement>('section[id^="panel-"]');
  if (!section) return null;
  const ul = listOf(bucketOf(section));
  return { target: { bucket: bucketOf(section), ul, slot: slotAt(ul, source, middle) }, tab: null };
}

/** The slot for a dragged task whose middle is at `y`: below every row whose middle it has passed. */
function slotAt(ul: HTMLElement, source: HTMLElement, y: number): number {
  const top = ul.getBoundingClientRect().top;
  return rowsIn(ul).filter((li) => li !== source && top + topIn(ul, li) + li.offsetHeight / 2 < y)
    .length;
}

/**
 * How far the k-th of a list's other rows slides to open a gap at slot `to`, when the dragged
 * task's own spot was `from` (or the end, if it came from another list).
 */
function shiftFor(k: number, from: number, to: number, height: number): number {
  if (k >= from && k < to) return -height; // up into the spot the task left
  if (k < from && k >= to) return height; // down, out of the gap's way
  return 0;
}

/** Slides rows so there's a task-sized gap at the target and nowhere else. */
export function arrange(source: HTMLElement, target: Target, height: number) {
  for (const ul of allLists()) {
    const rows = rowsIn(ul);
    const own = rows.indexOf(source);
    const others = rows.filter((li) => li !== source);
    const from = own < 0 ? others.length : own;
    const to = target.ul === ul ? target.slot : others.length;
    others.forEach((li, k) => {
      const shift = shiftFor(k, from, to, height);
      li.style.transform = shift ? `translateY(${shift}px)` : '';
    });
    // A list taking a task from another grows by a row, so its last task isn't cut off
    ul.style.paddingBottom = own < 0 && target.ul === ul ? `${height}px` : '';
  }
}

export function unarrange() {
  for (const ul of allLists()) {
    ul.style.paddingBottom = '';
    for (const li of rowsIn(ul)) li.style.transform = '';
  }
}

/** Where on screen the gap at a slot starts. */
export function gapTop(source: HTMLElement, ul: HTMLElement, slot: number, height: number): number {
  const top = ul.getBoundingClientRect().top;
  if (slot === 0) return top;
  const rows = rowsIn(ul);
  const own = rows.indexOf(source);
  const others = rows.filter((li) => li !== source);
  const above = others[slot - 1];
  const shift = shiftFor(slot - 1, own < 0 ? others.length : own, slot, height);
  return top + topIn(ul, above) + above.offsetHeight + shift;
}

/** Resolves in an animation frame, before it's drawn, once a moved task shows in its new spot. */
export function landed(id: string, to: Target): Promise<void> {
  return new Promise((resolve) => {
    let frames = 60; // or give up after about a second
    const check = () => {
      const rows = rowsIn(listOf(to.bucket));
      const i = rows.findIndex((li) => li.dataset.taskId === id);
      const there = i >= 0 && i === (to.ul ? to.slot : rows.length - 1);
      if (there || --frames === 0) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}
