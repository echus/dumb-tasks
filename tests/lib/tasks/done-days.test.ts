import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import {
  addDays,
  addMonths,
  dateLabel,
  doneByDay,
  monthCells,
  relativeDay,
  weekdayLabels,
} from '$lib/tasks/done-days';
import { addTask, completeTask, deleteTask, moveTask } from '$lib/tasks/tasks';

const at = (month: number, day: number, hour: number, min = 0) => new Date(2026, month - 1, day, hour, min);
const now = at(11, 19, 12);

beforeEach(async () => {
  await db.tasks.clear();
});

describe('doneByDay', () => {
  it('groups done tasks from every list by day, newest first', async () => {
    const a = (await addTask('a', at(11, 17, 9)))!;
    const b = (await addTask('b', at(11, 17, 9)))!;
    const c = (await addTask('c', at(11, 17, 9)))!;
    await moveTask(b, 'week', null, at(11, 17, 9, 1));
    await completeTask(a, at(11, 18, 10));
    await completeTask(b, at(11, 19, 9));
    await completeTask(c, at(11, 19, 11));

    const days = doneByDay(await db.tasks.toArray());
    expect([...days].sort().map(([day, done]) => [day, done.map((t) => t.text)])).toEqual([
      ['2026-11-18', ['a']],
      ['2026-11-19', ['c', 'b']],
    ]);
  });

  it('puts a task done before 4am on the day before', async () => {
    const a = (await addTask('a', at(11, 18, 9)))!;
    await completeTask(a, at(11, 19, 1));
    expect([...doneByDay(await db.tasks.toArray()).keys()]).toEqual(['2026-11-18']);
  });

  it('leaves out tasks not done, or deleted', async () => {
    await addTask('a', at(11, 19, 9));
    const b = (await addTask('b', at(11, 19, 9)))!;
    await completeTask(b, at(11, 19, 10));
    await deleteTask(b, at(11, 19, 11));
    expect(doneByDay(await db.tasks.toArray()).size).toBe(0);
  });
});

describe('calendar', () => {
  it('lays a month out from Monday, with blanks before the 1st', () => {
    const cells = monthCells('2026-11'); // 1 Nov 2026 is a Sunday
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(cells.at(-1)).toBe('2026-11-30');
    expect(monthCells('2026-06')[0]).toBe('2026-06-01'); // a Monday: no blanks
  });

  it('steps days and months across their ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -90)).toBe('2025-12-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('names the weekdays Monday first', () => {
    expect(weekdayLabels('en-GB')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
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
