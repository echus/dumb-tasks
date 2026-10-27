import { describe, expect, it } from 'vitest';
import { daysUntil, describeDeadline, parseDeadline } from './deadline';

// Monday 26 October 2026
const ref = new Date(2026, 9, 26, 10, 0);

describe('parseDeadline', () => {
  it.each([
    ['pay rent by friday', '2026-10-30', 'friday'],
    ['dentist 14 nov', '2026-11-14', '14 nov'],
    ['renew passport end of month', '2026-10-31', 'end of month'],
    ['call mum tomorrow', '2026-10-27', 'tomorrow'],
    ['bins on the 14th', '2026-11-14', 'the 14th'],
    ['tax return by march', '2027-03-01', 'march'],
  ])('%s → %s', (text, date, phrase) => {
    expect(parseDeadline(text, ref, 'dmy')).toEqual({ date, phrase });
  });

  it.each(['read 1984', 'call May', 'march for climate', 'buy milk', 'fix bike at 5pm'])(
    'ignores %s',
    (text) => {
      expect(parseDeadline(text, ref, 'dmy')).toBeNull();
    },
  );

  it('never resolves a weekday into the past', () => {
    expect(parseDeadline('email Sam monday', ref, 'dmy')?.date).not.toBe('2026-10-19');
  });

  it('follows day/month order', () => {
    expect(parseDeadline('due 3/4', ref, 'dmy')?.date).toBe('2027-04-03');
    expect(parseDeadline('due 3/4', ref, 'mdy')?.date).toBe('2027-03-04');
  });
});

describe('describeDeadline', () => {
  it('counts calendar days, not 24h periods', () => {
    const lateEvening = new Date(2026, 9, 26, 23, 59);
    expect(daysUntil('2026-10-27', lateEvening)).toBe(1);
  });

  it.each([
    ['2026-10-26', 'due today'],
    ['2026-10-27', 'due tomorrow'],
    ['2026-10-29', '3 days left'],
    ['2026-10-25', '1 day overdue'],
    ['2026-10-24', '2 days overdue'],
  ])('%s → %s', (deadline, label) => {
    expect(describeDeadline(deadline, ref)).toBe(label);
  });
});
