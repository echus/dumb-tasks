import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportData, importData, parseDataFile } from './data-file';
import { db } from './db';
import { mergeTask } from './merge';
import {
  addTask,
  byPosition,
  completeTask,
  deleteTask,
  editText,
  isActive,
  moveTask,
} from './tasks';
import type { Bucket } from './types';

const t0 = new Date(2026, 9, 26, 9, 0);
const later = (mins: number) => new Date(t0.getTime() + mins * 60_000);

async function texts(bucket: Bucket): Promise<string[]> {
  const all = await db.tasks.toArray();
  return all
    .filter((t) => t.bucket === bucket && isActive(t))
    .sort(byPosition)
    .map((t) => t.text);
}

beforeEach(async () => {
  await db.tasks.clear();
  await db.meta.clear();
});

describe('tasks', () => {
  it('adds new tasks to the top of Today, unsorted, with derived fields', async () => {
    await addTask('buy milk', t0);
    const id = (await addTask('pay rent by friday', later(1)))!;
    expect(await texts('today')).toEqual(['pay rent by friday', 'buy milk']);

    const task = (await db.tasks.get(id))!;
    expect(task).toMatchObject({
      sorted: false,
      deadline: '2026-10-30',
      deadlineText: 'friday',
      icon: 'house',
      category: 'home',
    });
    expect(task.fieldUpdatedAt.text).toBe(later(1).toISOString());
  });

  it('adds to the top of another bucket when given one', async () => {
    await addTask('a', t0, 'week');
    const id = (await addTask('b', later(1), 'week'))!;
    expect(await texts('week')).toEqual(['b', 'a']);
    expect(await texts('today')).toEqual([]);
    expect((await db.tasks.get(id))!.bucketHistory).toEqual([
      { bucket: 'week', at: later(1).toISOString() },
    ]);
  });

  it('keeps rapid adds in order', async () => {
    await Promise.all(['a', 'b', 'c', 'd'].map((t, i) => addTask(t, later(i))));
    const positions = (await db.tasks.toArray()).map((t) => t.position);
    expect(new Set(positions).size).toBe(4);
  });

  it('ignores blank input', async () => {
    expect(await addTask('   ', t0)).toBeNull();
    expect(await db.tasks.count()).toBe(0);
  });

  it('moves between buckets, recording history and per-field timestamps', async () => {
    const id = (await addTask('renew passport', t0))!;
    await moveTask(id, 'month', null, later(5));

    const task = (await db.tasks.get(id))!;
    expect(task.bucket).toBe('month');
    expect(task.sorted).toBe(true);
    expect(task.bucketHistory.map((h) => h.bucket)).toEqual(['today', 'month']);
    expect(task.fieldUpdatedAt.bucket).toBe(later(5).toISOString());
    expect(task.fieldUpdatedAt.text).toBe(t0.toISOString());
  });

  it('reorders within a bucket', async () => {
    const a = (await addTask('a', t0))!;
    const b = (await addTask('b', later(1)))!;
    const c = (await addTask('c', later(2)))!;
    expect(await texts('today')).toEqual(['c', 'b', 'a']);

    await moveTask(a, 'today', c, later(3)); // a before c
    expect(await texts('today')).toEqual(['a', 'c', 'b']);
    await moveTask(a, 'today', null, later(4)); // a to the end
    expect(await texts('today')).toEqual(['c', 'b', 'a']);
    await moveTask(b, 'today', c, later(5));
    expect(await texts('today')).toEqual(['b', 'c', 'a']);
  });

  it('re-derives deadline and icon on edit', async () => {
    const id = (await addTask('call mum', t0))!;
    await editText(id, 'dentist 14 nov', later(1));
    expect(await db.tasks.get(id)).toMatchObject({ deadline: '2026-11-14', icon: 'stethoscope' });
  });

  it('keeps completed and deleted tasks as history/tombstones', async () => {
    const a = (await addTask('a', t0))!;
    const b = (await addTask('b', t0))!;
    await completeTask(a, later(1));
    await deleteTask(b, later(1));
    expect(await texts('today')).toEqual([]);
    expect(await db.tasks.count()).toBe(2);
  });
});

describe('mergeTask', () => {
  it('keeps the newest edit of each field, whichever order', async () => {
    const id = (await addTask('call mum', t0))!;
    const base = (await db.tasks.get(id))!;

    // Phone: edits text. Laptop: moves to week. Both offline.
    await editText(id, 'call mum about sunday', later(10));
    const phone = (await db.tasks.get(id))!;
    await db.tasks.put(base);
    await moveTask(id, 'week', null, later(20));
    const laptop = (await db.tasks.get(id))!;

    for (const merged of [mergeTask(phone, laptop), mergeTask(laptop, phone)]) {
      expect(merged.text).toBe('call mum about sunday');
      expect(merged.bucket).toBe('week');
      expect(merged.bucketHistory.map((h) => h.bucket)).toEqual(['today', 'week']);
    }
    expect(mergeTask(phone, laptop)).toEqual(mergeTask(laptop, phone));
  });
});

describe('export / import', () => {
  it('round-trips through JSON and merges into existing data', async () => {
    const id = (await addTask('buy milk', t0))!;
    const backup = parseDataFile(JSON.stringify(await exportData(later(1))));
    expect(backup.schemaVersion).toBe(1);

    await moveTask(id, 'week', null, later(2));

    const result = await importData(backup);
    expect(result).toEqual({ added: 0, merged: 1 });
    // Local move is newer than the backup, so it survives the import.
    expect((await db.tasks.get(id))!.bucket).toBe('week');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseDataFile('{"hello": 1}')).toThrow(/backup/);
  });
});
