import type { Task } from '../types';
import { byCompletion, dayOf } from './tasks';

// Days are YYYY-MM-DD strings as dayOf gives them, and months YYYY-MM.

/** Done tasks from every list, by the day they were done, newest first within a day. */
export function doneByDay(tasks: Task[]): Map<string, Task[]> {
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.completedAt === null || t.deletedAt !== null) continue;
    const day = dayOf(new Date(t.completedAt));
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  for (const done of byDay.values()) done.sort(byCompletion);
  return byDay;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDate = (day: string) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date ?? 1);
};

export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

export function addMonths(month: string, n: number): string {
  const d = toDate(month);
  d.setMonth(d.getMonth() + n);
  return toDay(d).slice(0, 7);
}

/** A month's days in calendar order, Monday first, with null for the blanks before the 1st. */
export function monthCells(month: string): (string | null)[] {
  const first = toDate(month);
  const blanks = (first.getDay() + 6) % 7;
  const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length }, (_, i) => `${month}-${pad(i + 1)}`),
  ];
}

export function relativeDay(day: string, now: Date): 'today' | 'yesterday' | null {
  if (day === dayOf(now)) return 'today';
  if (day === dayOf(new Date(now.getTime() - 86_400_000))) return 'yesterday';
  return null;
}

/** The date in the device's own order, with the year if it isn't this one. */
export function dateLabel(day: string, now: Date, locale?: string): string {
  return toDate(day).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(day.slice(0, 4) !== dayOf(now).slice(0, 4) && { year: 'numeric' }),
  });
}

/** "Thu 19": the day inside a month already named. */
export const shortDayLabel = (day: string, locale?: string) =>
  toDate(day).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });

export const monthLabel = (month: string, locale?: string) =>
  toDate(month).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

export const monthName = (month: string, locale?: string) =>
  toDate(month).toLocaleDateString(locale, { month: 'long' });

/** Monday to Sunday, as the device writes them. */
export const weekdayLabels = (locale?: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }));
