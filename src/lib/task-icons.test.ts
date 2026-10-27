import { describe, expect, it } from 'vitest';
import { circleColour } from './task-icons';

const hue = (colour: string) => parseFloat(colour.slice(4));
const ids = Array.from({ length: 50 }, (_, i) => `01JBX3Z9K4T7Q2M8N5P6R1S${i}`);

describe('circleColour', () => {
  it('stays the same for a task', () => {
    expect(circleColour(ids[0])).toBe(circleColour(ids[0]));
  });

  it('never picks straight red or orange', () => {
    for (const id of ids) {
      const h = hue(circleColour(id));
      expect(h).toBeGreaterThanOrEqual(44);
      expect(h).toBeLessThanOrEqual(346);
    }
  });

  it('gives different tasks different colours', () => {
    expect(new Set(ids.map(circleColour)).size).toBe(ids.length);
  });
});
