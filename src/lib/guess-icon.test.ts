import { describe, expect, it } from 'vitest';
import { guessIcon } from './guess-icon';

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
