import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { dateLabel, doneDays, relativeDay } from '$lib/tasks/done-days';
import { addTask, completeTask, deleteTask, moveTask } from '$lib/tasks/tasks';

const at = (month: number, day: number, hour: number, min = 0) => new Date(2026, month - 1, day, hour, min);
const now = at(11, 19, 12);

beforeEach(async () => {
  await db.tasks.clear();
});

describe('doneDays', () => {
  it('groups done tasks from every list by day, newest day and task first', async () => {
    const a = (await addTask('a', at(11, 17, 9)))!;
    const b = (await addTask('b', at(11, 17, 9)))!;
    const c = (await addTask('c', at(11, 17, 9)))!;
    await moveTask(b, 'week', null, at(11, 17, 9, 1));
    await completeTask(a, at(11, 18, 10));
    await completeTask(b, at(11, 19, 9));
    await completeTask(c, at(11, 19, 11));

    const days = doneDays(await db.tasks.toArray(), now, 'en-GB');
    expect(days.map((d) => [d.date, d.relative, d.tasks.map((t) => t.text)])).toEqual([
      ['Thu 19 Nov', 'today', ['c', 'b']],
      ['Wed 18 Nov', 'yesterday', ['a']],
    ]);
  });

  it('puts a task done before 4am on the day before', async () => {
    const a = (await addTask('a', at(11, 18, 9)))!;
    await completeTask(a, at(11, 19, 1));
    expect(doneDays(await db.tasks.toArray(), now, 'en-GB')[0].day).toBe('2026-11-18');
  });

  it('leaves out tasks not done, or deleted', async () => {
    await addTask('a', at(11, 19, 9));
    const b = (await addTask('b', at(11, 19, 9)))!;
    await completeTask(b, at(11, 19, 10));
    await deleteTask(b, at(11, 19, 11));
    expect(doneDays(await db.tasks.toArray(), now)).toEqual([]);
  });
});

describe('day labels', () => {
  it('names today and yesterday', () => {
    expect(relativeDay('2026-11-19', now)).toBe('today');
    expect(relativeDay('2026-11-18', now)).toBe('yesterday');
    expect(relativeDay('2026-11-17', now)).toBe(null);
  });

  it('writes the date in the device order', () => {
    expect(dateLabel('2026-11-17', now, 'en-GB')).toBe('Tue 17 Nov');
    expect(dateLabel('2026-11-17', now, 'en-US')).toBe('Tue, Nov 17');
  });

  it('adds the year to a day in another year', () => {
    expect(dateLabel('2025-12-30', at(1, 2, 12), 'en-GB')).toBe('Tue, 30 Dec 2025');
  });
});
