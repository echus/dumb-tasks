import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { history, redo, track, trackMove, undo } from '$lib/tasks/history.svelte';
import { activeIn, addTask, completeTask, deleteTask, editText, isActive, moveTask } from '$lib/tasks/tasks';

const active = async () => (await db.tasks.toArray()).filter(isActive).map((t) => t.text);

beforeEach(async () => {
  await db.tasks.clear();
  while (history.canUndo) await undo(); // drain any steps left from the previous test
});

describe('undo / redo', () => {
  it('undoes and redoes adding a task', async () => {
    await track(null, () => addTask('buy milk'));
    expect(await active()).toEqual(['buy milk']);

    await undo();
    expect(await active()).toEqual([]);
    expect(await db.tasks.count()).toBe(1); // tombstoned, not removed, so sync sees it

    await redo();
    expect(await active()).toEqual(['buy milk']);
  });

  it('undoes edits, completion, deletion and moves', async () => {
    const id = (await addTask('call mum'))!;

    await track([id], () => editText(id, 'call mum tomorrow'));
    await track([id], () => moveTask(id, 'week', null));
    await track([id], () => completeTask(id));
    await track([id], () => deleteTask(id));

    await undo();
    expect((await db.tasks.get(id))!.deletedAt).toBeNull();
    await undo();
    expect((await db.tasks.get(id))!.completedAt).toBeNull();
    await undo();
    expect((await db.tasks.get(id))!.bucket).toBe('today');
    await undo();
    expect((await db.tasks.get(id))!).toMatchObject({ text: 'call mum', deadline: null });
    expect(history.canUndo).toBe(false);
  });

  it('undoes only what the action changed', async () => {
    const id = (await addTask('call mum'))!;
    await track([id], () => editText(id, 'call dad'));
    await moveTask(id, 'week', null); // from sync or another tab: not an undo step

    await undo();
    expect(await db.tasks.get(id)).toMatchObject({ text: 'call mum', bucket: 'week' });
    await redo();
    expect(await db.tasks.get(id)).toMatchObject({ text: 'call dad', bucket: 'week' });
  });

  it('undoes a move that made room among tasks sharing a position', async () => {
    // As when two devices each added a task at the same place before syncing
    const [a, b] = [(await addTask('a'))!, (await addTask('b'))!];
    await db.tasks.where('id').anyOf(a, b).modify({ position: 'a0' });
    const c = (await addTask('c'))!;
    await db.tasks.update(c, { position: 'a1' });
    const order = async () => (await activeIn('today')).map((t) => t.text);
    const before = await order();

    const second = (await activeIn('today'))[1].id;
    await trackMove(c, 'today', () => moveTask(c, 'today', second));
    expect(await order()).not.toEqual(before);
    await undo();
    expect(await order()).toEqual(before);
  });

  it("doesn't take an edit made during a move for part of the move", async () => {
    const [a, b] = [(await addTask('a'))!, (await addTask('b'))!]; // b above a
    let edit!: Promise<void>;
    await trackMove(b, 'today', async () => {
      edit = Dexie.ignoreTransaction(() => editText(a, 'a edited')); // from sync, or another tab
      await moveTask(b, 'today', null); // b to the end
    });
    await edit;
    await undo();
    expect((await activeIn('today')).map((t) => t.text)).toEqual(['b', 'a edited']);
  });

  it('clears redo after a new action', async () => {
    const id = (await addTask('a'))!;
    await track([id], () => editText(id, 'b'));
    await undo();
    expect(history.canRedo).toBe(true);
    await track([id], () => editText(id, 'c'));
    expect(history.canRedo).toBe(false);
  });

  it('skips actions that change nothing', async () => {
    const id = (await addTask('a'))!;
    await track([id], () => editText(id, 'a'));
    expect(history.canUndo).toBe(false);
  });
});
