import { describe, expect, it } from 'vitest';
import { GUESSABLE_ICONS, guessIcon } from './guess-icon';
import { TASK_ICONS } from './task-icons';

describe('guessIcon', () => {
  it('only picks icons that are bundled', () => {
    expect(GUESSABLE_ICONS.sort()).toEqual(Object.keys(TASK_ICONS).sort());
  });

  it.each([
    ['call mum', 'phone'],
    ['calling the bank', 'landmark'],
    ['buy milk', 'shopping-cart'],
    ['buy birthday present for Sam', 'cake'],
    ['dentist 14 nov', 'stethoscope'],
    ['email Sarah about the invoice', 'receipt'],
    ['sort out the boiler', 'wrench'],
    ['pay rent by friday', 'house'],
    ['renew passport', 'file-text'],
    ['take the bins out', 'trash'],
    ['groceries', 'shopping-cart'],
    ['learn guitar', 'keyboard-music'],
  ])('%s → %s', (text, icon) => {
    expect(guessIcon(text)?.icon).toBe(icon);
  });

  it.each([
    ['dentst appointment', 'stethoscope'],
    ['plumbr', 'wrench'],
    ['groc', 'shopping-cart'],
    ['think about stuff', 'lightbulb'], // exact: "think"
  ])('near misses: %s → %s', (text, icon) => {
    expect(guessIcon(text)?.icon).toBe(icon);
  });

  it('returns null when nothing fits', () => {
    expect(guessIcon('hello')).toBeNull();
    expect(guessIcon('test')).toBeNull();
    expect(guessIcon('the thing')).toBeNull(); // not a typo of "think"
    expect(guessIcon('check')).toBeNull(); // not short for "checkup"
    expect(guessIcon('')).toBeNull();
  });
});
