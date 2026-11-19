import { parseHsl } from '../tasks/circle-colours';
import { reduceMotion } from './done-motion';

// A little burst out of a task's circle as it's ticked off: hearts, stars, sparkles or
// sprinkles, picked at random each time, in shades of the task's own colour. Drawn in a layer of its own on the page, so the
// list's edge doesn't cut it off and it stays put as the row glides away.

const KINDS = ['hearts', 'stars', 'sparkles', 'sprinkles'] as const;
type Kind = (typeof KINDS)[number];

// ︎ asks for the plain text glyph, so it takes the colour and isn't drawn as an emoji
const GLYPHS: Record<Exclude<Kind, 'sprinkles'>, string> = {
  hearts: '♥︎',
  stars: '★︎',
  sparkles: '✦︎',
};

const random = (from: number, to: number) => from + Math.random() * (to - from);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/** The task's own colour, a little lighter or darker and a touch round the wheel, so the bits stand apart. */
function near(colour: string): string {
  const hsl = parseHsl(colour);
  if (!hsl) {
    const shade = Math.random() < 0.5 ? 'white' : 'black';
    return `color-mix(in oklch, ${colour} ${Math.round(random(70, 100))}%, ${shade})`;
  }
  const hue = (hsl.hue + random(-12, 12) + 360) % 360;
  const lightness = Math.min(80, Math.max(35, hsl.lightness + random(-12, 14)));
  return `hsl(${hue.toFixed(1)} 100% ${lightness.toFixed(1)}%)`;
}

export function celebrate(from: Element, colour: string) {
  if (reduceMotion()) return;
  const kind = pick(KINDS);
  const box = from.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed',
    left: `${box.left + box.width / 2}px`,
    top: `${box.top + box.height / 2}px`,
    zIndex: '1000',
    pointerEvents: 'none',
  });

  const count = kind === 'sprinkles' ? 10 : 7;
  const animations: Animation[] = [];
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('span');
    const tint = near(colour);
    Object.assign(bit.style, { position: 'absolute', left: '0', top: '0', lineHeight: '1' });
    if (kind === 'sprinkles') {
      Object.assign(bit.style, { width: '2px', height: '6px', borderRadius: '1px', background: tint });
    } else {
      bit.textContent = GLYPHS[kind];
      Object.assign(bit.style, { color: tint, fontSize: `${Math.round(random(7, 10))}px` });
    }
    layer.append(bit);

    const angle = (i / count) * Math.PI * 2 + random(-0.3, 0.3);
    const distance = random(20, 32);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const turn = random(-90, 90);
    const at = (dx: number, dy: number, scale: number, deg: number) =>
      `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale}) rotate(${deg}deg)`;
    animations.push(
      bit.animate(
        [
          { transform: at(0, 0, 0.3, 0), opacity: 0.8 },
          { transform: at(x * 0.85, y * 0.85, 1, turn / 2), opacity: 0.8, offset: 0.5 },
          { transform: at(x, y + 4, 0.7, turn), opacity: 0 }, // a little fall as it fades
        ],
        // Holds the faded last frame: without it a bit that ends before the rest springs back
        // to the middle, in full, till the layer goes
        { duration: random(500, 650), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)', fill: 'forwards' },
      ),
    );
  }

  document.body.append(layer);
  Promise.allSettled(animations.map((a) => a.finished)).then(() => layer.remove());
}
