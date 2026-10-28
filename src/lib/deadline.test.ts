import { describe, expect, it } from 'vitest';
import { daysUntil, deadlineHeat, describeDeadline, parseDeadline } from './deadline';

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

  it.each(['3d printing', 'buy 3d printer', 'call mum 2h'])('ignores shorthand in %s', (text) => {
    expect(parseDeadline(text, ref, 'dmy')).toBeNull();
    expect(parseDeadline(text, ref, 'mdy')).toBeNull();
  });

  it('still reads shorthand after a trigger word', () => {
    expect(parseDeadline('report due 3d', ref, 'mdy')?.date).toBe('2026-10-29');
  });

  it('skips phrases the user dismissed, and looks further on', () => {
    expect(parseDeadline('dentist 14 nov', ref, 'dmy', ['14 Nov'])).toBeNull();
    expect(parseDeadline('bins tomorrow, not friday', ref, 'dmy', ['tomorrow'])).toEqual({
      date: '2026-10-30',
      phrase: 'friday',
    });
  });

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

describe('deadlineHeat', () => {
  it.each([
    ['2026-10-24', 1],
    ['2026-10-26', 1],
    ['2026-10-31', 0.5],
    ['2026-11-05', 0],
    ['2026-12-25', 0],
  ])('%s → %s', (deadline, heat) => {
    expect(deadlineHeat(deadline, ref)).toBe(heat);
  });

  it('cools a little each day', () => {
    expect(deadlineHeat('2026-10-28', ref)).toBeGreaterThan(deadlineHeat('2026-10-29', ref));
  });
});
