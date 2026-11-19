import type { Task } from '../types';
import { byCompletion, dayOf } from './tasks';

export interface DoneDay {
  day: string; // YYYY-MM-DD, as dayOf gives it
  date: string; // as the device writes dates
  relative: 'today' | 'yesterday' | null;
  tasks: Task[]; // newest first
}

/** Done tasks from every list, by the day they were done, newest day first. */
export function doneDays(tasks: Task[], now: Date, locale?: string): DoneDay[] {
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.completedAt === null || t.deletedAt !== null) continue;
    const day = dayOf(new Date(t.completedAt));
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  return [...byDay]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, done]) => ({
      day,
      date: dateLabel(day, now, locale),
      relative: relativeDay(day, now),
      tasks: done.sort(byCompletion),
    }));
}

export function relativeDay(day: string, now: Date): DoneDay['relative'] {
  if (day === dayOf(now)) return 'today';
  if (day === dayOf(new Date(now.getTime() - 86_400_000))) return 'yesterday';
  return null;
}

/** The date in the device's own order, with the year if it isn't this one. */
export function dateLabel(day: string, now: Date, locale?: string): string {
  const today = dayOf(now);
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(String(year) !== today.slice(0, 4) && { year: 'numeric' }),
  });
}
