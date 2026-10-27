/** Shown when no keyword matched */
export const PLAIN_ICON = '📄';

// Icon circles are fluoro: full saturation, any hue except straight orange and red, which
// look dull beside the rest. The warm end runs from golden yellow round to pinky red.
const HUE_FROM = 44; // golden yellow
const HUE_TO = 346; // pinky red (360 is red)

/** A random circle colour, stored on the task. Hue and lightness vary continuously, so no
 *  two tasks are quite the same. */
export function pickCircleColour(random = Math.random): string {
  const hue = HUE_FROM + random() * (HUE_TO - HUE_FROM);
  const lightness = 50 + Math.floor(random() * 13); // 50–62%
  return `hsl(${hue.toFixed(1)} 100% ${lightness}%)`;
}
