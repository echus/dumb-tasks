import { describe, expect, it } from 'vitest';
import { pickCircleColour } from './task-icons';

const hue = (colour: string) => parseFloat(colour.slice(4));

describe('pickCircleColour', () => {
  it('never picks straight red or orange', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const h = hue(pickCircleColour(() => r));
      expect(h).toBeGreaterThanOrEqual(44);
      expect(h).toBeLessThanOrEqual(346);
    }
  });

  it('varies from pick to pick', () => {
    const picks = Array.from({ length: 50 }, () => pickCircleColour());
    expect(new Set(picks).size).toBeGreaterThan(45);
  });
});
