import type * as chrono from 'chrono-node';
import * as en from 'chrono-node/en'; // English only, keeps other locales out of the bundle

type DateOrder = 'dmy' | 'mdy';

interface ParsedDeadline {
  date: string; // YYYY-MM-DD
  phrase: string; // as it appears in the task
}

// Words that, placed right before a date, make it clearly a deadline.
const TRIGGER = /\b(by|due|on|before|until|till|for)\s*$/i;

// Shorthand durations ("3d", "2h") that chrono reads as "from now". On their own they're
// far more often part of something else, like "3d printing".
const SHORTHAND = /^\d+(?!st|nd|rd|th)[a-z]{1,3}$/i;

// "on the 14th" — chrono doesn't pick up a bare ordinal day.
const ordinalDay: chrono.Parser = {
  pattern: () => /\bthe\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
  extract: (ctx, match) => {
    const day = parseInt(match[1], 10);
    if (day < 1 || day > 31) return null;
    // Next occurrence of that day: this month if still ahead, otherwise next month.
    const ref = ctx.refDate;
    const date = new Date(ref.getFullYear(), ref.getMonth(), day);
    if (day < ref.getDate()) date.setMonth(date.getMonth() + 1, day);
    return { day, month: date.getMonth() + 1, year: date.getFullYear() };
  },
};

function makeParser(order: DateOrder): chrono.Chrono {
  const parser = (order === 'dmy' ? en.GB : en.casual).clone();
  parser.parsers.push(ordinalDay);
  return parser;
}

const parsers: Record<DateOrder, chrono.Chrono> = {
  dmy: makeParser('dmy'),
  mdy: makeParser('mdy'),
};

function defaultDateOrder(): DateOrder {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  return /^en-(US|PH)$/i.test(locale) ? 'mdy' : 'dmy';
}

/**
 * Finds a deadline in task text. Prefers missing a deadline over inventing one:
 * a bare month ("march for climate") only counts after a trigger word ("by march").
 * `ignore` holds phrases the user has said aren't dates.
 */
export function parseDeadline(
  text: string,
  ref: Date = new Date(),
  order: DateOrder = defaultDateOrder(),
  ignore: readonly string[] = [],
): ParsedDeadline | null {
  const results = parsers[order].parse(text, ref, { forwardDate: true });

  for (const r of results) {
    const s = r.start;
    const hasDay = s.isCertain('day') || s.isCertain('weekday');
    const hasMonth = s.isCertain('month');
    if (!hasDay && !hasMonth) continue; // time-only, year-only
    const triggered = TRIGGER.test(text.slice(0, r.index));
    if (!hasDay && !triggered) continue;
    if (SHORTHAND.test(r.text) && !triggered) continue;
    if (ignore.some((p) => p.toLowerCase() === r.text.toLowerCase())) continue;

    return { date: toISODate(s.date()), phrase: r.text };
  }
  return null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Whole days from `today` to `deadline`, both as local calendar dates. */
export function daysUntil(deadline: string, today: Date = new Date()): number {
  const [y, m, d] = deadline.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - now) / 86_400_000);
}

export function describeDeadline(deadline: string, today: Date = new Date()): string {
  const n = daysUntil(deadline, today);
  if (n === 0) return 'due today';
  if (n === 1) return 'due tomorrow';
  if (n > 1) return `${n} days left`;
  if (n === -1) return '1 day overdue';
  return `${-n} days overdue`;
}

// Days out at which a badge has cooled all the way to green; it's yellow halfway there.
const HEAT_HORIZON = 10;

/** How close a deadline is: 1 when due today (or overdue), easing to 0 at HEAT_HORIZON days. */
export function deadlineHeat(deadline: string, today: Date = new Date()): number {
  const n = daysUntil(deadline, today);
  return Math.min(1, Math.max(0, 1 - n / HEAT_HORIZON));
}
