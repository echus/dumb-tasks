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

function bucketOf(list: HTMLElement | null | undefined): Bucket | null {
  return list ? (list.id.replace('panel-', '') as Bucket) : null;
}

/** Updates the drag state for whatever is under a point (used by touch drags). */
function dragOver(x: number, y: number) {
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
    drag.bucket = bucketOf(list);
    drag.overTask = row.dataset.taskId!;
    drag.after = y > box.top + box.height / 2;
  } else {
    drag.bucket = bucketOf(list);
  }
}

const HOLD_MS = 350; // press this long to pick a task up
const SLOP = 8; // moving further than this first means scrolling, not dragging

/**
 * Touch dragging: long-press a task to pick it up, move, and release over a list or tab.
 * Browsers' built-in drag-and-drop doesn't work reliably with touch.
 */
export function touchDrag(node: HTMLElement, task: { id: string }) {
  let current = task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;
  let active = false;
  let preview: HTMLElement | null = null;
  let grabX = 0; // where in the row the finger is, so the copy stays under it
  let grabY = 0;

  /** A copy of the row (icon, text, badge) that follows the finger. */
  function lift() {
    const box = node.getBoundingClientRect();
    grabX = startX - box.left;
    grabY = startY - box.top;
    preview = rowCopy(node);
    document.body.append(preview);
    follow(startX, startY);
  }

  function follow(x: number, y: number) {
    if (preview) preview.style.transform = `translate(${x - grabX}px, ${y - grabY}px)`;
  }

  function drop() {
    preview?.remove();
    preview = null;
  }

  function onStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    if ((e.target as Element).closest('button.delete, input')) return; // the icon can start a drag too; a quick tap still ticks it
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    timer = setTimeout(() => {
      active = true;
      drag.id = current.id;
      navigator.vibrate?.(10);
      lift();
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
    follow(t.clientX, t.clientY);
    dragOver(t.clientX, t.clientY);
  }

  function onEnd(e: TouchEvent) {
    clearTimeout(timer);
    if (!active) return;
    active = false;
    e.preventDefault(); // no click afterwards, so the task doesn't open for editing
    drop();
    finishDrop();
  }

  function onCancel() {
    clearTimeout(timer);
    drop();
    if (active) endDrag();
    active = false;
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
      clearTimeout(timer);
      drop();
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    },
  };
}
