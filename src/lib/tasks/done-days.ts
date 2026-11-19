import type { Task } from '../types';
import { byCompletion, dayOf } from './tasks';

export interface DoneDay {
  day: string; // YYYY-MM-DD, as dayOf gives it
  label: string;
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
    .map(([day, done]) => ({ day, label: dayLabel(day, now, locale), tasks: done.sort(byCompletion) }));
}

/** "Today", "Yesterday", or the date in the device's own order, with the year if it isn't this one. */
export function dayLabel(day: string, now: Date, locale?: string): string {
  const today = dayOf(now);
  if (day === today) return 'Today';
  if (day === dayOf(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(String(year) !== today.slice(0, 4) && { year: 'numeric' }),
  });
}
