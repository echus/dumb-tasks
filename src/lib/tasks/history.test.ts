import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { history, redo, track, undo } from './history.svelte';
import { addTask, completeTask, deleteTask, editText, isActive, moveTask } from './tasks';

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
