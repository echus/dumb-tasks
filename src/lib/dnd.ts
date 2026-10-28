import { tick } from 'svelte';
import { track } from './history.svelte';
import { moveTask } from './tasks';
import type { Bucket } from './types';
import { drag, endDrag } from './ui-state.svelte';

// Where a dragged task lands. Mouse drags use the browser's drag-and-drop and show an
// insertion line (finishDrop); touch drags pick the task up and open a gap where it will
// land (touchDrag).

/** The task ids shown in a bucket's list, top to bottom. */
function idsIn(bucket: Bucket): string[] {
  return [...document.querySelectorAll<HTMLElement>(`#panel-${bucket} li[data-task-id]`)].map(
    (li) => li.dataset.taskId!,
  );
}

/** Moves the dragged task to wherever the pointer is: above/below a task, or the list's end. */
export function finishDrop() {
  const { id, bucket, overTask, after } = drag;
  endDrag();
  if (!id || !bucket) return;

  let beforeId: string | null = null;
  if (overTask) {
    const ids = idsIn(bucket);
    const i = ids.indexOf(overTask);
    beforeId = after ? (ids[i + 1] ?? null) : overTask;
    if (beforeId === id) beforeId = ids[i + 2] ?? null; // dropped just below itself
  }
  track([id], () => moveTask(id, bucket, beforeId));
}

/** A plain copy of a task row, styled like a lifted task, for drag previews. */
function rowCopy(node: HTMLElement): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.style.listStyle = 'none';
  const wrap = document.createElement('div');
  wrap.className = 'drag-preview';
  wrap.style.width = `${node.getBoundingClientRect().width}px`;
  wrap.append(copy);
  return wrap;
}

/**
 * Mouse drags: the browser snapshots the row the instant a drag starts, hover tick and all.
 * Give it a clean copy instead (the copy isn't hovered, so it shows the emoji).
 */
export function setDragImage(e: DragEvent, node: HTMLElement) {
  if (!e.dataTransfer) return;
  const copy = rowCopy(node);
  copy.style.transform = 'translate(-10000px, 0)'; // must be in the page, but out of sight
  document.body.append(copy);
  const box = node.getBoundingClientRect();
  e.dataTransfer.setDragImage(copy, e.clientX - box.left, e.clientY - box.top);
  setTimeout(() => copy.remove());
}

const HOLD_MS = 200; // press this long to pick a task up
const SLOP = 8; // moving further than this first means scrolling, not dragging
const SPRING_MS = 500; // hold a task over another tab this long to open it
const EDGE = 56; // this close to the top or bottom of a list's view scrolls it
const MAX_SPEED = 14; // scrolling right at the edge, in px per frame
const SETTLE_MS = 180; // a dropped task gliding into place (as .drag-preview.settling)

/** Where a touch-dragged task would land. */
interface Target {
  bucket: Bucket;
  ul: HTMLElement | null; // its list, or null for a tab whose list isn't showing (lands at the end)
  slot: number; // how many of the list's other tasks end up above it
}

const listOf = (bucket: Bucket) => document.querySelector<HTMLElement>(`#panel-${bucket} ul`)!;
const allLists = () => document.querySelectorAll<HTMLElement>('section[id^="panel-"] ul');
const rowsIn = (ul: HTMLElement) => [...ul.querySelectorAll<HTMLElement>(':scope > li[data-task-id]')];
const bucketOf = (el: HTMLElement) => el.closest('section')!.id.replace('panel-', '') as Bucket;
const shown = (el: HTMLElement) => el.getClientRects().length > 0; // tabs hide the other lists

/** A row's top within its list. Offsets ignore transforms, so it's where the row sits unshifted. */
const topIn = (ul: HTMLElement, li: HTMLElement) => li.offsetTop - ul.offsetTop;

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
function arrange(source: HTMLElement, target: Target, height: number) {
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

function unarrange() {
  for (const ul of allLists()) {
    ul.style.paddingBottom = '';
    for (const li of rowsIn(ul)) li.style.transform = '';
  }
}

/** The slot for a dragged task whose middle is at `y`: below every row whose middle it has passed. */
function slotAt(ul: HTMLElement, source: HTMLElement, y: number): number {
  const top = ul.getBoundingClientRect().top;
  return rowsIn(ul).filter((li) => li !== source && top + topIn(ul, li) + li.offsetHeight / 2 < y)
    .length;
}

/** Where on screen the gap at a slot starts. */
function gapTop(source: HTMLElement, ul: HTMLElement, slot: number, height: number): number {
  const top = ul.getBoundingClientRect().top;
  if (slot === 0) return top;
  const rows = rowsIn(ul);
  const own = rows.indexOf(source);
  const others = rows.filter((li) => li !== source);
  const above = others[slot - 1];
  const shift = shiftFor(slot - 1, own < 0 ? others.length : own, slot, height);
  return top + topIn(ul, above) + above.offsetHeight + shift;
}

/** The list's own scroll box (wide screens), or null when the page scrolls instead (phones). */
function scrollerOf(ul: HTMLElement | null): HTMLElement | null {
  const box = ul?.closest<HTMLElement>('.scroll');
  return box && getComputedStyle(box).overflowY !== 'visible' ? box : null;
}

/** Scroll speed for a finger at `y`: faster the closer it is to the top or bottom edge. */
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

/** Resolves in an animation frame, before it's drawn, once a moved task shows in its new spot. */
function landed(id: string, to: Target): Promise<void> {
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

/** One touch drag at a time, until its task has settled into place. */
let busy = false;

/**
 * Touch dragging: long-press a task to pick it up, and the rows part to show where it will
 * land. Release over a list, or over a tab for the end of that list; hold it over a tab to
 * open that list instead. Near the top or bottom of the screen the list scrolls.
 * Browsers' built-in drag-and-drop doesn't work reliably with touch.
 */
export function touchDrag(node: HTMLElement, task: { id: string }) {
  let current = task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let springTimer: ReturnType<typeof setTimeout> | undefined;
  let springTab: HTMLElement | null = null;
  let frame = 0;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let active = false;
  let preview: HTMLElement | null = null;
  let grabX = 0; // where in the row the finger is, so the copy stays under it
  let grabY = 0;
  let height = 0; // the row's, measured on pickup: opening another tab hides its list
  let target: Target;

  /** A copy of the row (icon, text, badge) lifts off the list and follows the finger. */
  function lift() {
    node.classList.remove('pressing');
    const box = node.getBoundingClientRect();
    grabX = startX - box.left;
    grabY = startY - box.top;
    height = box.height;
    preview = rowCopy(node);
    document.body.append(preview);
    follow(startX, startY);
    void preview.offsetWidth; // start from flat, so it grows into the lift
    preview.classList.add('lifted');

    // The row itself stays behind, empty, as the gap
    node.classList.add('drag-source');
    document.documentElement.classList.add('touch-dragging');
    const ul = node.closest('ul')!;
    target = { bucket: bucketOf(ul), ul, slot: rowsIn(ul).indexOf(node) };
  }

  function follow(x: number, y: number) {
    if (preview) preview.style.transform = `translate(${x - grabX}px, ${y - grabY}px)`;
  }

  /** Works out where the task would land with the finger at (x, y), and makes room there. */
  function update(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    const tab = el?.closest<HTMLElement>('[data-tab]');
    const section = el?.closest<HTMLElement>('section[id^="panel-"]');
    if (tab) {
      const bucket = tab.dataset.tab as Bucket;
      const ul = listOf(bucket);
      target = shown(ul)
        ? { bucket, ul, slot: rowsIn(ul).filter((li) => li !== node).length }
        : { bucket, ul: null, slot: 0 };
    } else if (section) {
      const ul = listOf(bucketOf(section));
      target = { bucket: bucketOf(section), ul, slot: slotAt(ul, node, y - grabY + height / 2) };
    } // anywhere else (the margins, the header): keep the last spot
    drag.overTab = tab ? target.bucket : null;
    arrange(node, target, height);
    springLoad(tab);
  }

  /** Holding the task over another tab opens it, so the task can go anywhere in that list. */
  function springLoad(tab: HTMLElement | null | undefined) {
    const closed = tab?.getAttribute('aria-selected') === 'false' ? tab : null;
    if (closed === springTab) return;
    clearTimeout(springTimer);
    springTab = closed;
    if (!closed) return;
    springTimer = setTimeout(() => {
      springTab = null;
      closed.click();
      navigator.vibrate?.(10);
      tick().then(() => active && update(lastX, lastY));
    }, SPRING_MS);
  }

  /** Scrolls while the finger rests near the top or bottom, making room as rows pass under it. */
  function autoScroll() {
    const scroller = scrollerOf(target.ul);
    const speed = edgeSpeed(scroller, lastY);
    if (speed) {
      (scroller ?? window).scrollBy(0, speed);
      update(lastX, lastY);
    }
    frame = requestAnimationFrame(autoScroll);
  }

  /** Glides the copy into its gap (or off into a tab), then moves the task there for real. */
  async function settle() {
    const id = current.id;
    const to = target;
    const p = preview!;
    p.classList.add('settling');
    p.classList.remove('lifted');
    if (to.ul) {
      p.style.transform = `translate(${to.ul.getBoundingClientRect().left}px, ${gapTop(node, to.ul, to.slot, height)}px)`;
    } else {
      const tab = document.querySelector(`[data-tab="${to.bucket}"]`)!.getBoundingClientRect();
      const x = tab.left + tab.width / 2 - p.offsetWidth / 2;
      const y = tab.top + tab.height / 2 - p.offsetHeight / 2;
      p.style.transform = `translate(${x}px, ${y}px)`;
      p.classList.add('gone');
    }

    const others = to.ul ? rowsIn(to.ul).filter((li) => li !== node) : [];
    const stays = to.ul === node.closest('ul') && to.slot === rowsIn(to.ul!).indexOf(node);
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    if (!stays) {
      const beforeId = others[to.slot]?.dataset.taskId ?? null;
      await track([id], () => moveTask(id, to.bucket, beforeId));
      await landed(id, to); // so the rows don't jump back before the list redraws
    }
    if (preview) reset(); // already done if the row went to another list (see destroy)
  }

  /** Back to normal: rows unshifted, the task's own row showing, no copy. */
  function reset() {
    unarrange();
    document.documentElement.classList.remove('touch-dragging');
    node.classList.remove('drag-source');
    preview?.remove();
    preview = null;
    busy = false;
  }

  function stop() {
    active = false;
    cancelAnimationFrame(frame);
    clearTimeout(springTimer);
    springTab = null;
    endDrag();
  }

  function onStart(e: TouchEvent) {
    if (busy || e.touches.length !== 1) return;
    if ((e.target as Element).closest('button.delete, input')) return; // the icon can start a drag too; a quick tap still ticks it
    startX = lastX = e.touches[0].clientX;
    startY = lastY = e.touches[0].clientY;
    node.classList.add('pressing');
    timer = setTimeout(() => {
      active = busy = true;
      drag.id = current.id;
      navigator.vibrate?.(10);
      lift();
      frame = requestAnimationFrame(autoScroll);
    }, HOLD_MS);
  }

  function onMove(e: TouchEvent) {
    const t = e.touches[0];
    if (!active) {
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > SLOP) {
        clearTimeout(timer);
        node.classList.remove('pressing');
      }
      return;
    }
    e.preventDefault(); // keep the page from scrolling while dragging
    lastX = t.clientX;
    lastY = t.clientY;
    follow(lastX, lastY);
    update(lastX, lastY);
  }

  function onEnd(e: TouchEvent) {
    clearTimeout(timer);
    node.classList.remove('pressing');
    if (!active) return;
    e.preventDefault(); // no click afterwards, so the task doesn't open for editing
    stop();
    settle();
  }

  function onCancel() {
    clearTimeout(timer);
    node.classList.remove('pressing');
    if (!active) return;
    stop();
    reset();
  }

  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: false });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onCancel);
  return {
    update(next: { id: string }) {
      current = next;
    },
    destroy() {
      // A task dropped in another list gets a new row there, and this one goes, mid-settle
      clearTimeout(timer);
      if (active) stop();
      if (preview) reset();
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    },
  };
}
