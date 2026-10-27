// Measures which circle hues each task icon disappears on, for CLASHING_HUES in
// src/lib/task-icons.ts. Paste into the browser console on the dev server (Safari or Chrome
// on a Mac, so the emoji are Apple's) and copy the printed table over the old one.
//
// Each emoji is drawn on a canvas and its outline pixels (opaque pixels next to transparent
// ones) are compared with the circle colour in OKLab, lightness counting more than colour:
// thin grey line art vanishes on a mid blue even though grey and blue differ. A hue clashes
// when 40% or more of the outline is that close, in either theme, at any circle lightness.

const { ICONS } = await import('/src/lib/guess-icon.ts');
const { PLAIN_ICON } = await import('/src/lib/task-icons.ts');

const HUE_FROM = 44;
const HUE_TO = 346;
const LIGHTNESSES = [50, 56, 62];
// [share of fluoro colour, pale base], as --circle-tint and --tint-base in app.css
const THEMES = [
  [0.75, [240, 240, 242]],
  [0.5, [255, 255, 255]],
];
const CLOSE = 0.1; // OKLab distance
const COLOUR_WEIGHT = 0.4; // how much a/b difference counts beside lightness
const CLASH_SHARE = 0.4;

const linear = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function oklab(r, g, b) {
  [r, g, b] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function hslToRgb(h, l) {
  l /= 100;
  const a = Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return [f(0), f(8), f(4)];
}

const canvas = document.createElement('canvas');
canvas.width = canvas.height = 64;
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function outline(emoji) {
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = '56px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 34);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  const alpha = (x, y) => (x < 0 || y < 0 || x > 63 || y > 63 ? 0 : d[(y * 64 + x) * 4 + 3]);
  const pixels = [];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (alpha(x, y) < 128) continue;
      let edge = false;
      for (let dy = -2; dy <= 2 && !edge; dy++) {
        for (let dx = -2; dx <= 2 && !edge; dx++) edge = alpha(x + dx, y + dy) < 128;
      }
      const i = (y * 64 + x) * 4;
      if (edge) pixels.push(oklab(d[i], d[i + 1], d[i + 2]));
    }
  }
  return pixels;
}

function clashes(pixels, hue) {
  return THEMES.some(([tint, base]) =>
    LIGHTNESSES.some((l) => {
      const c = oklab(...hslToRgb(hue, l).map((v, i) => v * tint + base[i] * (1 - tint)));
      const close = pixels.filter(
        (p) =>
          Math.hypot(p[0] - c[0], COLOUR_WEIGHT * (p[1] - c[1]), COLOUR_WEIGHT * (p[2] - c[2])) <
          CLOSE,
      );
      return close.length / pixels.length >= CLASH_SHARE;
    }),
  );
}

const lines = [];
for (const emoji of new Set([...ICONS, PLAIN_ICON])) {
  const pixels = outline(emoji);
  let arcs = [];
  for (let h = HUE_FROM; h <= HUE_TO; h += 2) {
    if (!clashes(pixels, h)) continue;
    const last = arcs.at(-1);
    // Bridge small gaps, which are measuring noise
    if (last && h - last[1] <= 12) last[1] = h;
    else arcs.push([h, h]);
  }
  arcs = arcs.filter(([a, b]) => b - a >= 4);
  lines.push(`  '${emoji}': ${JSON.stringify(arcs).replaceAll(',', ', ')},`);
}
console.log(lines.join('\n'));
