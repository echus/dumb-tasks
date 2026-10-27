// Emoji for each icon the guesser can pick. Keys are the names stored on tasks (they
// predate the switch to emoji, so they describe the old icon rather than the emoji).
export const TASK_ICONS: Record<string, string> = {
  'baby': '👶',
  'bike': '🏃',
  'book-open': '📖',
  'briefcase': '💼',
  'cake': '🎂',
  'calendar': '📅',
  'camera': '📷',
  'car': '🚗',
  'cat': '🐈',
  'code': '⌨️',
  'credit-card': '💳',
  'dog': '🐕',
  'dumbbell': '🏋️',
  'file-text': '📄',
  'fuel': '⛽',
  'gift': '🎁',
  'graduation-cap': '🎓',
  'heart-pulse': '🧘',
  'house': '🏠',
  'keyboard-music': '🎵',
  'landmark': '🏦',
  'laptop': '💻',
  'lightbulb': '💡',
  'mail': '✉️',
  'package': '📦',
  'paintbrush': '🎨',
  'pen-line': '✏️',
  'phone': '📞',
  'pill': '💊',
  'plane': '✈️',
  'presentation': '📊',
  'receipt': '🧾',
  'scissors': '✂️',
  'shirt': '👕',
  'shopping-cart': '🛒',
  'sofa': '🛋️',
  'sprout': '🌱',
  'stethoscope': '🩺',
  'trash': '🗑️',
  'users': '👥',
  'utensils': '🍽️',
  'wallet': '💰',
  'washing-machine': '🧺',
  'wrench': '🔧',
};

/** Shown when nothing matched */
export const PLAIN_ICON = '📄';

// Icon circles are fluoro: full saturation, any hue except straight orange and red, which
// look dull beside the rest. The warm end runs from golden yellow round to pinky red.
const HUE_FROM = 44; // golden yellow
const HUE_TO = 346; // pinky red (360 is red)

/** A task's circle colour: picked from its id, so it looks random but never changes. Hue
 *  and lightness vary continuously, so no two tasks are quite the same. */
export function circleColour(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0; // mix, so similar ids spread out
  const hue = HUE_FROM + ((hash % 1000) / 1000) * (HUE_TO - HUE_FROM);
  const lightness = 50 + ((hash >>> 10) % 13); // 50–62%
  return `hsl(${hue.toFixed(1)} 100% ${lightness}%)`;
}
