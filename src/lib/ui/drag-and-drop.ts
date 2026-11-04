import { tick } from 'svelte';
import { trackMove } from '../tasks/history.svelte';
import { moveTask } from '../tasks/tasks';
import { BUCKET_LABELS } from '../types';
import {
  arrange,
  gapTop,
  landed,
  rowsIn,
  startingTarget,
  targetAt,
  unarrange,
  type Target,
} from './drag-layout';
import { DragPreview } from './drag-preview';
import { scrollNearEdge } from './drag-scroll';
import { drag, endDrag } from './state.svelte';

// Dragging a task to a new spot, by mouse or touch: the task lifts off its list and the rows
// part to show where it will land. The browser's own drag-and-drop isn't used: it doesn't
// work reliably with touch, and it can't show the rows making room. This file has the drag
// itself, from press to drop; drag-layout.ts works out where the task lands and makes room,
// drag-preview.ts draws the copy that follows the pointer, and drag-scroll.ts scrolls.

const HOLD_MS = 200; // press this long to pick a task up by touch
const SLOP = 8; // moving further than this first means scrolling (touch) or dragging (mouse)
const SPRING_MS = 500; // hold a task over another tab this long to open it
const SETTLE_MS = 180; // a dropped task gliding into place (as .drag-preview.settling)

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
  let preview: DragPreview | null = null;
  let grabY = 0; // how far down the row the pointer is
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
    grabY = startY - box.top;
    height = box.height;
    preview = new DragPreview(node, startX - box.left, grabY, startX, startY);

    // The row itself stays behind, empty, as the gap
    node.classList.add('drag-source');
    document.documentElement.classList.add('dragging-task');
    target = startingTarget(node);
  }

  /** Works out where the task would land with the pointer at (x, y), and makes room there. */
  function update(x: number, y: number) {
    // Anywhere but a list or tab (the margins, the header): keep the last spot
    const over = targetAt(x, y, node, y - grabY + height / 2);
    if (over) target = over.target;
    const tab = over?.tab ?? null;
    drag.overTab = tab ? target.bucket : null;
    preview?.overTab(tab ? `move to ${BUCKET_LABELS[target.bucket]}` : null);
    arrange(node, target, height);
    springLoad(tab);
  }

  /** Holding the task over another tab opens it, so the task can go anywhere in that list. */
  function springLoad(tab: HTMLElement | null) {
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
    if (scrollNearEdge(target.ul, lastY)) update(lastX, lastY);
    frame = requestAnimationFrame(autoScroll);
  }

  /** Glides the copy into its gap (or off into a tab), then moves the task there for real. */
  async function settle() {
    const id = current.id;
    const to = target;
    if (to.ul) preview!.settleAt(to.ul.getBoundingClientRect().left, gapTop(node, to.ul, to.slot, height));
    else preview!.settleInto(document.querySelector<HTMLElement>(`[data-tab="${to.bucket}"]`)!);

    const others = to.ul ? rowsIn(to.ul).filter((li) => li !== node) : [];
    const stays = to.ul === node.closest('ul') && to.slot === rowsIn(to.ul!).indexOf(node);
    try {
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      if (!stays) {
        const beforeId = others[to.slot]?.dataset.taskId ?? null;
        await trackMove(id, to.bucket, () => moveTask(id, to.bucket, beforeId));
        await landed(id, to); // so the rows don't jump back before the list redraws
      }
    } finally {
      if (preview) reset(); // already done if the row went to another list (see destroy)
    }
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
    preview?.follow(x, y);
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
