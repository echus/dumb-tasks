/** Shown when no keyword matched. Allowed on every hue, though it's pale on greens. */
export const PLAIN_ICON = '⭐';

// Icon circles are fluoro: full saturation, any hue except straight orange and red, which
// look dull beside the rest. The warm end runs from golden yellow round to pinky red.
const HUE_FROM = 44; // golden yellow
const HUE_TO = 346; // pinky red (360 is red)

// Hue arcs each icon disappears on: where much of the emoji's outline is close to the circle
// colour (in either theme, at any lightness), like the grey shopping trolley on blue. White
// icons only stand out on the darker blues and violets. Measured from Apple's emoji by
// scripts/measure-icon-clashes.js; an empty list means nothing clashes. Emoji not listed
// (the AI can pick any) can have any hue.
export const CLASHING_HUES: Record<string, [from: number, to: number][]> = {
  '🎂': [[44, 52], [144, 284], [312, 346]],
  '🎁': [[334, 346]],
  '👶': [[326, 346]],
  '🐕': [],
  '🐈': [[194, 230], [314, 346]],
  '🩺': [],
  '💊': [],
  '🏋️': [],
  '🏃': [[44, 52], [194, 208], [320, 346]],
  '🧘': [[324, 346]],
  '🏦': [[196, 286], [320, 346]],
  '🧾': [[44, 224], [282, 346]],
  '💰': [],
  '📄': [[44, 220], [290, 346]],
  '✈️': [[204, 270]],
  '🚗': [],
  '⛽': [],
  '📦': [[326, 346]],
  '✂️': [[320, 346]],
  '👕': [[200, 282]],
  '🔧': [],
  '🧺': [],
  '🗑️': [[206, 268]],
  '🌱': [],
  '🛋️': [[182, 272]],
  '🏠': [],
  '🍽️': [[44, 54], [80, 216]],
  '📊': [[44, 56], [76, 228], [272, 346]],
  '📅': [[44, 214]],
  '⌨️': [[44, 220]],
  '💼': [],
  '💻': [],
  '🎓': [],
  '🎵': [],
  '📷': [],
  '🎨': [[324, 346]],
  '✏️': [[328, 346]],
  '📖': [[214, 264]],
  '💡': [[44, 208]],
  '👥': [[206, 270]],
  '📞': [],
  '✉️': [[44, 222], [284, 346]],
  '💳': [[44, 56], [72, 226], [322, 346]],
  '🛒': [[214, 256]],
  '⭐': [], // measured to clash on greens and cyans, but kept for variety
};

/** The parts of the fluoro range the icon stays visible on, in hue order. */
function allowedArcs(icon: string): [number, number][] {
  const arcs: [number, number][] = [];
  let from = HUE_FROM;
  for (const [a, b] of [...(CLASHING_HUES[icon] ?? [])].sort((x, y) => x[0] - y[0])) {
    if (a > from) arcs.push([from, a]);
    from = Math.max(from, b);
  }
  if (from < HUE_TO) arcs.push([from, HUE_TO]);
  return arcs.length ? arcs : [[HUE_FROM, HUE_TO]];
}

// How far a new circle's hue keeps from its neighbours', so they're clearly different
const NEIGHBOUR_GAP = 60;

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Cuts the hues within `gap` of `hue` (either way round the wheel) out of some arcs. */
function cutAround(arcs: [number, number][], hue: number, gap: number): [number, number][] {
  return arcs.flatMap(([a, b]) => {
    const out: [number, number][] = [];
    // Walk the arc, keeping the stretches far enough from the hue
    let from = a;
    for (const centre of [hue - 360, hue, hue + 360]) {
      const [lo, hi] = [centre - gap, centre + gap];
      if (hi <= from || lo >= b) continue;
      if (lo > from) out.push([from, lo]);
      from = Math.max(from, hi);
    }
    if (from < b) out.push([from, b]);
    return out;
  });
}

function parseHsl(colour: string): { hue: number; lightness: number } | null {
  const m = /^hsl\(([\d.]+) [\d.]+% ([\d.]+)%\)$/.exec(colour);
  return m && { hue: +m[1], lightness: +m[2] };
}

/** A random circle colour for a task's icon, stored on the task. Hue and lightness vary
 *  continuously, so no two tasks are quite the same; hues the icon would vanish on are
 *  skipped, and so are hues close to the `near` colours (the tasks it sits beside). */
export function pickCircleColour(
  icon: string | null,
  near: readonly string[] = [],
  random = Math.random,
): string {
  const arcs = allowedArcs(icon ?? PLAIN_ICON);
  const neighbours = near.map(parseHsl).filter((c) => c !== null);
  const free = neighbours.reduce((left, n) => cutAround(left, n.hue, NEIGHBOUR_GAP), arcs);

  let hue: number;
  if (free.length) {
    // Spread the random pick over the free arcs laid end to end
    let along = random() * free.reduce((sum, [a, b]) => sum + b - a, 0);
    hue = free[0][0];
    for (const [a, b] of free) {
      hue = a + along;
      if (along < b - a) break;
      along -= b - a;
    }
  } else {
    // The icon's arcs are too narrow to keep the gap: go as far from the neighbours as they allow
    const nearest = (h: number) => Math.min(...neighbours.map((n) => hueDistance(h, n.hue)));
    hue = arcs[0][0];
    for (const [a, b] of arcs) {
      for (let h = a; h <= b; h++) if (nearest(h) > nearest(hue)) hue = h;
    }
  }

  // Lightness on the other side of the range from the first neighbour's, for a bit more contrast
  const side = neighbours.length ? (neighbours[0].lightness >= 56 ? 0 : 1) : Math.floor(random() * 2);
  const lightness = 50 + side * 7 + Math.floor(random() * 6); // 50–55% or 57–62%
  return `hsl(${hue.toFixed(1)} 100% ${lightness}%)`;
}
