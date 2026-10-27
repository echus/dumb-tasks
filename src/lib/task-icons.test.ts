import { describe, expect, it } from 'vitest';
import { ICONS } from './guess-icon';
import { CLASHING_HUES, PLAIN_ICON, pickCircleColour } from './task-icons';

const hue = (colour: string) => parseFloat(colour.slice(4));

/** Hues spread evenly over the whole random range */
const sweep = (icon: string | null) =>
  Array.from({ length: 1000 }, (_, i) => hue(pickCircleColour(icon, [], () => i / 1000)));

describe('pickCircleColour', () => {
  it('never picks straight red or orange', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const h = hue(pickCircleColour('🐕', [], () => r));
      expect(h).toBeGreaterThanOrEqual(44);
      expect(h).toBeLessThanOrEqual(346);
    }
  });

  it('varies from pick to pick', () => {
    const picks = Array.from({ length: 50 }, () => pickCircleColour('🐕'));
    expect(new Set(picks).size).toBeGreaterThan(45);
  });

  it('skips hues the icon would vanish on', () => {
    for (const [icon, arcs] of Object.entries(CLASHING_HUES)) {
      for (const h of sweep(icon)) {
        for (const [from, to] of arcs) {
          if (h > from && h < to) throw new Error(`${icon} got hue ${h}, inside ${from}–${to}`);
        }
      }
    }
  });

  it('still spreads over the hues that are left', () => {
    const hues = sweep('🛒');
    expect(Math.min(...hues)).toBeLessThan(50);
    expect(Math.max(...hues)).toBeGreaterThan(340);
    expect(hues.some((h) => h > 256 && h < 300)).toBe(true);
  });

  it('keeps well away from the hue beside it', () => {
    for (const [icon, beside] of [['🐕', 200], ['🛒', 60], ['🦄', 340]] as const) {
      for (let i = 0; i < 100; i++) {
        const h = hue(pickCircleColour(icon, [`hsl(${beside} 100% 55%)`], () => i / 100));
        expect(Math.min(Math.abs(h - beside), 360 - Math.abs(h - beside))).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('goes as far as it can when the icon has few hues', () => {
    // The page only has 220–290
    expect(hue(pickCircleColour('📄', ['hsl(230 100% 55%)']))).toBe(290);
    expect(hue(pickCircleColour('📄', ['hsl(280 100% 55%)']))).toBe(220);
    const h = hue(pickCircleColour('📄', ['hsl(255 100% 55%)']));
    expect([220, 290]).toContain(h);
  });

  it('flips lightness from the colour beside it', () => {
    const lightness = (c: string) => parseFloat(c.split(' ')[2]);
    for (let i = 0; i < 20; i++) {
      expect(lightness(pickCircleColour('🐕', ['hsl(100 100% 60%)']))).toBeLessThanOrEqual(55);
      expect(lightness(pickCircleColour('🐕', ['hsl(100 100% 51%)']))).toBeGreaterThanOrEqual(57);
    }
  });

  it('treats no icon as the plain star', () => {
    expect(sweep(null)).toEqual(sweep(PLAIN_ICON));
  });

  it('can use any hue for emoji it has no measurements for', () => {
    const hues = sweep('🦄');
    expect(Math.min(...hues)).toBe(44);
    expect(Math.max(...hues)).toBeGreaterThan(345);
  });
});

describe('CLASHING_HUES', () => {
  // A new keyword icon needs measuring: run scripts/measure-icon-clashes.js
  it('covers every icon the keyword table can pick', () => {
    const missing = [...ICONS, PLAIN_ICON].filter((icon) => !(icon in CLASHING_HUES));
    expect(missing).toEqual([]);
  });

  it('leaves every icon some hues', () => {
    for (const icon of Object.keys(CLASHING_HUES)) {
      expect(new Set(sweep(icon).map(Math.round)).size, icon).toBeGreaterThan(30);
    }
  });
});
