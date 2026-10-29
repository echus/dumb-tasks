import { tick } from 'svelte';
import { track } from '../tasks/history.svelte';
import { moveTask } from '../tasks/tasks';
import { BUCKET_LABELS, type Bucket } from '../types';
import { drag, endDrag } from './state.svelte';

// Dragging a task to a new spot, by mouse or touch: the task lifts off its list and the rows
// part to show where it will land. The browser's own drag-and-drop isn't used: it doesn't
// work reliably with touch, and it can't show the rows making room.

const HOLD_MS = 200; // press this long to pick a task up by touch
const SLOP = 8; // moving further than this first means scrolling (touch) or dragging (mouse)
const SPRING_MS = 500; // hold a task over another tab this long to open it
const EDGE = 56; // this close to the top or bottom of a list's view scrolls it
const MAX_SPEED = 14; // scrolling right at the edge, in px per frame
const SETTLE_MS = 180; // a dropped task gliding into place (as .drag-preview.settling)

/** Where a dragged task would land. */
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

/**
 * The copy of a task row that follows the pointer: the row (icon, text, badge) on a card,
 * with a label above it saying where it's headed when it's over a tab.
 */
function rowCopy(node: HTMLElement): HTMLElement {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.style.listStyle = 'none';
  const card = document.createElement('div');
  card.className = 'drag-card';
  card.append(copy);
  const label = document.createElement('div');
  label.className = 'drag-label';
  const wrap = document.createElement('div');
  wrap.className = 'drag-preview';
  wrap.style.width = `${node.getBoundingClientRect().width}px`;
  wrap.append(label, card);
  return wrap;
}

function swallow(e: Event) {
  e.stopPropagation();
  e.preventDefault();
}

/** One drag at a time, until its task has settled into place. */
let busy = false;

/**
 * Drag a task with a mouse, or long-press it with a finger, to pick it up; the rows part to
 * show where it will land. Release over a list, or over a tab for the end of that list; hold
 * it over a tab to open that list instead. Near the top or bottom of a list it scrolls.
 */
export function dragTask(node: HTMLElement, task: { id: string }) {
  let current = task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let springTimer: ReturnType<typeof setTimeout> | undefined;
  let springTab: HTMLElement | null = null;
  let frame = 0;
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastY = 0;
  let mouse = false; // this press is a mouse's (it picks up on moving, not holding)
  let field: HTMLInputElement | null = null; // pressed in the task's text field, while editing
  let selecting = false; // ...and moved sideways, so it's selecting text, not dragging
  let active = false;
  let preview: HTMLElement | null = null;
  let grabX = 0; // where in the row the pointer is, so the copy stays under it
  let grabY = 0;
  let height = 0; // the row's, measured on pickup: opening another tab hides its list
  let target: Target;

  function pickUp() {
    active = busy = true;
    drag.id = current.id;
    if (!mouse) navigator.vibrate?.(10);
    lift();
    frame = requestAnimationFrame(autoScroll);
  }

  /** A copy of the row lifts off the list and follows the pointer. */
  function lift() {
    node.classList.remove('pressing');
    const box = node.getBoundingClientRect();
    grabX = startX - box.left;
    grabY = startY - box.top;
    height = box.height;
    preview = rowCopy(node);
    // The copy shrinks towards the pointer, and its label sits just above it (kept on screen)
    preview.style.setProperty('--grab-x', `${grabX}px`);
    preview.style.setProperty('--grab-y', `${grabY}px`);
    preview.style.setProperty('--label-x', `${Math.min(Math.max(grabX, 70), box.width - 70)}px`);
    document.body.append(preview);
    follow(startX, startY);
    void preview.offsetWidth; // start from flat, so it grows into the lift
    preview.classList.add('lifted');

    // The row itself stays behind, empty, as the gap
    node.classList.add('drag-source');
    document.documentElement.classList.add('dragging-task');
    const ul = node.closest('ul')!;
    target = { bucket: bucketOf(ul), ul, slot: rowsIn(ul).indexOf(node) };
  }

  function follow(x: number, y: number) {
    if (preview) preview.style.transform = `translate(${x - grabX}px, ${y - grabY}px)`;
  }

  /** Works out where the task would land with the pointer at (x, y), and makes room there. */
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
    if (preview) {
      // Over a tab, the copy fades back so the tab shows, and says where it's going
      preview.classList.toggle('over-tab', !!tab);
      if (tab) preview.firstElementChild!.textContent = `move to ${BUCKET_LABELS[target.bucket]}`;
    }
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
      if (!mouse) navigator.vibrate?.(10);
      tick().then(() => active && update(lastX, lastY));
    }, SPRING_MS);
  }

  /** Scrolls while the pointer rests near the top or bottom, making room as rows pass under it. */
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
      p.classList.remove('over-tab');
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
    document.documentElement.classList.remove('dragging-task');
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

  /** A press on the row. A finger picks the task up by holding still; a mouse, by moving. */
  function press(x: number, y: number, on: EventTarget | null, byMouse: boolean): boolean {
    if (busy) return false;
    if ((on as Element).closest('.actions')) return false; // the icon can start a drag too; a quick tap still ticks it
    // While a task is being edited, a finger in its field is for the text (the caret, the
    // magnifier); a mouse can still drag the task from it, by moving up or down
    field = (on as Element).closest('input');
    if (field && !byMouse) return false;
    selecting = false;
    mouse = byMouse;
    startX = lastX = x;
    startY = lastY = y;
    if (!mouse) {
      node.classList.add('pressing');
      timer = setTimeout(pickUp, HOLD_MS);
    }
    return true;
  }

  /** Before pickup, moving a finger means scrolling, and moving a mouse means dragging. */
  function moveTo(x: number, y: number): boolean {
    if (!active) {
      const dx = Math.abs(x - startX);
      const dy = Math.abs(y - startY);
      if (selecting) return false;
      if (field) {
        // In the text field, sideways is selecting text; only a clear move up or down drags
        if (dx > SLOP) selecting = true;
        if (selecting || dy <= 2 * SLOP) return false;
        // Leaving the field saves the edit, as clicking away would. Pick the task up once it
        // shows as saved: the row's height can change with it.
        field.blur();
        field = null;
        tick().then(() => moveTo(x, y));
        return true;
      } else if (Math.hypot(dx, dy) <= SLOP) return false;
      clearTimeout(timer);
      node.classList.remove('pressing');
      if (!mouse) return false;
      pickUp();
    }
    lastX = x;
    lastY = y;
    follow(x, y);
    update(x, y);
    return true;
  }

  /** Letting go drops the task, if it was picked up. */
  function release(): boolean {
    clearTimeout(timer);
    node.classList.remove('pressing');
    if (!active) return false;
    stop();
    settle();
    return true;
  }

  function cancel() {
    clearTimeout(timer);
    node.classList.remove('pressing');
    if (!active) return;
    stop();
    reset();
  }

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) press(e.touches[0].clientX, e.touches[0].clientY, e.target, false);
  }

  function onTouchMove(e: TouchEvent) {
    const t = e.touches[0];
    if (moveTo(t.clientX, t.clientY)) e.preventDefault(); // keep the page from scrolling while dragging
  }

  function onTouchEnd(e: TouchEvent) {
    if (release()) e.preventDefault(); // no click afterwards, so the task doesn't open for editing
  }

  // Mice go by pointer events. Touches do too, but those stay with the touch events above,
  // which can stop the page scrolling once a drag starts.
  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (!press(e.clientX, e.clientY, e.target, true)) return;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMove(e: PointerEvent) {
    moveTo(e.clientX, e.clientY);
  }

  function onPointerUp() {
    unlisten();
    if (!release()) return;
    // No click afterwards, so the task doesn't open for editing (or get ticked, from the icon).
    // The click comes straight after this, so stop catching them once it's past.
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true));
  }

  function onPointerCancel() {
    unlisten();
    cancel();
  }

  function unlisten() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd);
  node.addEventListener('touchcancel', cancel);
  node.addEventListener('pointerdown', onPointerDown);
  return {
    update(next: { id: string }) {
      current = next;
    },
    destroy() {
      // A task dropped in another list gets a new row there, and this one goes, mid-settle
      clearTimeout(timer);
      if (active) stop();
      if (preview) reset();
      unlisten();
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', cancel);
      node.removeEventListener('pointerdown', onPointerDown);
    },
  };
}
