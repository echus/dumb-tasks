import { parseHsl } from '../tasks/circle-colours';
import { reduceMotion } from './done-motion';

// A small burst from a task's circle as it's ticked off, in shades of the task's own colour.
// One kind, picked at random each time. Drawn in a layer of its own on the page, so the
// list's edge doesn't cut it off and it stays put as the row glides away.

const KINDS = ['ripple', 'rays', 'dots', 'plus', 'diamonds', 'ticks'] as const;
type Kind = (typeof KINDS)[number];

const random = (from: number, to: number) => from + Math.random() * (to - from);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

const EASE_OUT = 'cubic-bezier(0.2, 0.8, 0.3, 1)';

// 'both' holds the first frame through a delay and the faded last frame at the end: without
// it a bit shows in full before it starts, or springs back once it's done, till the layer goes
const timing = (duration: number, delay = 0): KeyframeAnimationOptions => ({
  duration,
  delay,
  easing: EASE_OUT,
  fill: 'both',
});

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

function bit(layer: HTMLElement, style: Partial<CSSStyleDeclaration>, text = ''): HTMLElement {
  const el = document.createElement('span');
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', lineHeight: '1', ...style });
  el.textContent = text;
  layer.append(el);
  return el;
}

/** Two thin rings that grow out of the circle and fade, the second just behind the first. */
function ripple(layer: HTMLElement, colour: string, size: number): Animation[] {
  return [0, 110].map((delay, i) => {
    const ring = bit(layer, {
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      border: `${i ? 1 : 1.5}px solid ${near(colour)}`,
      boxSizing: 'border-box',
    });
    return ring.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.7 },
        { transform: `translate(-50%, -50%) scale(${i ? 1.9 : 2.2})`, opacity: 0 },
      ],
      timing(550, delay),
    );
  });
}

/** Short thin lines that shoot straight out from the circle's edge and shrink away. */
function rays(layer: HTMLElement, colour: string, size: number): Animation[] {
  const count = 8;
  const edge = size / 2 + 3;
  return Array.from({ length: count }, (_, i) => {
    const ray = bit(layer, { width: '1.5px', height: '7px', borderRadius: '1px', background: near(colour) });
    const deg = (i / count) * 360 + 360 / count / 2; // off the straight up, down and sides
    const at = (out: number, length: number) =>
      `translate(-50%, -50%) rotate(${deg}deg) translateY(${-out}px) scaleY(${length})`;
    return ray.animate(
      [
        { transform: at(edge, 0.4), opacity: 0.85 },
        { transform: at(edge + 7, 1), opacity: 0.85, offset: 0.4 },
        { transform: at(edge + 13, 0.2), opacity: 0 },
      ],
      timing(500),
    );
  });
}

/** Small pieces that fly out round the circle, turn a little and fall a touch as they fade. */
function scatter(layer: HTMLElement, colour: string, kind: Exclude<Kind, 'ripple' | 'rays'>): Animation[] {
  const count = kind === 'dots' ? 9 : 7;
  return Array.from({ length: count }, (_, i) => {
    const tint = near(colour);
    // ︎ asks for the plain text glyph, so it takes the colour and isn't drawn as an emoji
    const piece =
      kind === 'dots'
        ? bit(layer, { width: '4px', height: '4px', borderRadius: '50%', background: tint })
        : kind === 'diamonds'
          ? bit(layer, { width: '4px', height: '4px', background: tint })
          : bit(
              layer,
              { color: tint, fontSize: `${Math.round(random(8, 11))}px`, fontWeight: '700' },
              kind === 'plus' ? '+' : '✓︎',
            );

    const angle = (i / count) * Math.PI * 2 + random(-0.3, 0.3);
    const distance = random(20, 32);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const base = kind === 'diamonds' ? 45 : 0; // a square on its point
    const turn = kind === 'ticks' ? random(-20, 20) : random(-90, 90); // ticks stay upright enough to read
    const at = (dx: number, dy: number, scale: number, deg: number) =>
      `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale}) rotate(${base + deg}deg)`;
    return piece.animate(
      [
        { transform: at(0, 0, 0.3, 0), opacity: 0.8 },
        { transform: at(x * 0.85, y * 0.85, 1, turn / 2), opacity: 0.8, offset: 0.5 },
        { transform: at(x, y + 4, 0.7, turn), opacity: 0 },
      ],
      timing(random(500, 650)),
    );
  });
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

  const animations =
    kind === 'ripple'
      ? ripple(layer, colour, box.width)
      : kind === 'rays'
        ? rays(layer, colour, box.width)
        : scatter(layer, colour, kind);

  document.body.append(layer);
  Promise.allSettled(animations.map((a) => a.finished)).then(() => layer.remove());
}
