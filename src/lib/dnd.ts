import { track } from './history.svelte';
import { moveTask } from './tasks';
import type { Bucket } from './types';
import { drag, endDrag } from './ui-state.svelte';

// Where a dragged task lands, shared by mouse drags (lists and tabs) and touch drags.

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

/** Updates the drag state for whatever is under a point (used by touch drags). */
export function dragOver(x: number, y: number) {
  drag.x = x;
  drag.y = y;
  const el = document.elementFromPoint(x, y);
  const tab = el?.closest<HTMLElement>('[data-tab]');
  const row = el?.closest<HTMLElement>('li[data-task-id]');
  const list = el?.closest<HTMLElement>('section[id^="panel-"]');

  drag.overTask = null;
  drag.overTab = null;
  if (tab) {
    drag.bucket = drag.overTab = tab.dataset.tab as Bucket; // a phone tab: drop at its list's end
  } else if (row && row.dataset.taskId === drag.id) {
    drag.bucket = null; // over itself: nowhere to drop
  } else if (row) {
    const box = row.getBoundingClientRect();
    drag.bucket = list?.id.replace('panel-', '') as Bucket;
    drag.overTask = row.dataset.taskId!;
    drag.after = y > box.top + box.height / 2;
  } else {
    drag.bucket = list ? (list.id.replace('panel-', '') as Bucket) : null;
  }
}

const HOLD_MS = 350; // press this long to pick a task up
const SLOP = 8; // moving further than this first means scrolling, not dragging

/**
 * Touch dragging: long-press a task to pick it up, move, and release over a list or tab.
 * Browsers' built-in drag-and-drop doesn't work reliably with touch.
 */
export function touchDrag(node: HTMLElement, task: { id: string; text: string }) {
  let current = task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;
  let active = false;

  function onStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    if ((e.target as Element).closest('button.icon, button.delete, input')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    timer = setTimeout(() => {
      active = true;
      drag.id = current.id;
      drag.label = current.text;
      drag.touch = true;
      navigator.vibrate?.(10);
      dragOver(startX, startY);
    }, HOLD_MS);
  }

  function onMove(e: TouchEvent) {
    const t = e.touches[0];
    if (!active) {
      if (Math.hypot(t.clientX - startX, t.clientY - startY) > SLOP) clearTimeout(timer);
      return;
    }
    e.preventDefault(); // keep the page from scrolling while dragging
    dragOver(t.clientX, t.clientY);
  }

  function onEnd(e: TouchEvent) {
    clearTimeout(timer);
    if (!active) return;
    active = false;
    e.preventDefault(); // no click afterwards, so the task doesn't open for editing
    finishDrop();
  }

  function onCancel() {
    clearTimeout(timer);
    if (active) endDrag();
    active = false;
  }

  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: false });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('touchcancel', onCancel);
  return {
    update(next: { id: string; text: string }) {
      current = next;
    },
    destroy() {
      clearTimeout(timer);
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    },
  };
}
