import { describe, expect, it } from 'vitest';
import { guessIcon } from '$lib/tasks/guess-icon';
import { PLAIN_ICON } from '$lib/tasks/circle-colours';
import { ICON_EXAMPLES } from './icon-examples';

describe('guessIcon', () => {
  it.each([
    ['call mum', '📞'],
    ['calling the bank', '🏦'],
    ['buy milk', '🛒'],
    ['buy birthday present for Sam', '🎂'],
    ['dentist 14 nov', '🩺'],
    ['email Sarah about the invoice', '🧾'],
    ['sort out the boiler', '🔧'],
    ['pay rent by friday', '🏠'],
    ['renew passport', '📄'],
    ['take the bins out', '🗑️'],
    ['groceries', '🛒'],
    ['learn guitar', '🎵'],
    ['upload photos to Google Drive', '📷'], // not 🚗
  ])('%s → %s', (text, emoji) => {
    expect(guessIcon(text)).toBe(emoji);
  });

  it.each([
    ['dentst appointment', '🩺'],
    ['plumbr', '🔧'],
    ['groc', '🛒'],
    ['think about stuff', '💡'], // exact: "think"
  ])('near misses: %s → %s', (text, emoji) => {
    expect(guessIcon(text)).toBe(emoji);
  });

  it('returns null when nothing fits', () => {
    expect(guessIcon('hello')).toBeNull();
    expect(guessIcon('test')).toBeNull();
    expect(guessIcon('the thing')).toBeNull(); // not a typo of "think"
    expect(guessIcon('check')).toBeNull(); // not short for "checkup"
    expect(guessIcon('')).toBeNull();
  });
});

describe('guessIcon on everyday tasks', () => {
  const emoji = (s: string) => [...new Intl.Segmenter().segment(s)].map((g) => g.segment);
  const results = ICON_EXAMPLES.map(([text, right]) => {
    const guess = guessIcon(text) ?? PLAIN_ICON;
    return { text, guess, right: emoji(right).includes(guess) };
  });
  const share = (n: number) => n / results.length;
  const misses = results.filter((r) => !r.right).map((r) => `${r.text} → ${r.guess}`);

  it('gets most right', () => {
    expect(share(results.filter((r) => r.right).length), misses.join('\n')).toBeGreaterThanOrEqual(0.9);
  });

  it('hardly ever shows a wrong icon', () => {
    const wrong = results.filter((r) => !r.right && r.guess !== PLAIN_ICON);
    expect(share(wrong.length), wrong.map((r) => `${r.text} → ${r.guess}`).join('\n')).toBeLessThanOrEqual(0.03);
  });
});
