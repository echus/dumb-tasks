/** Shown when no keyword matched */
export const PLAIN_ICON = '📄';

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

/** A random circle colour for a task's icon, stored on the task. Hue and lightness vary
 *  continuously, so no two tasks are quite the same; hues the icon would vanish on are
 *  skipped. */
export function pickCircleColour(icon: string | null, random = Math.random): string {
  // Spread the random pick over the allowed arcs laid end to end
  const arcs = allowedArcs(icon ?? PLAIN_ICON);
  let along = random() * arcs.reduce((sum, [a, b]) => sum + b - a, 0);
  let hue = arcs[0][0];
  for (const [a, b] of arcs) {
    hue = a + along;
    if (along < b - a) break;
    along -= b - a;
  }
  const lightness = 50 + Math.floor(random() * 13); // 50–62%
  return `hsl(${hue.toFixed(1)} 100% ${lightness}%)`;
}
