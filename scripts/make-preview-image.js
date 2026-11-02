// Makes the preview images from screenshots of the real app with a few example tasks:
// - public/og-image.png: the 1200×630 card shown when someone shares a link to the app, with
//   the desktop layout under the logo and tagline (light only: a card can't follow the theme)
// - docs/preview.png and docs/preview-dark.png: the top of the README, desktop and phone
//   together, for GitHub's light and dark themes
//
// Start the dev server (npm run dev), then: node scripts/make-preview-image.js
// Uses the Chrome installed on this computer, so the emoji are the system's own. Circle
// colours are random, so run it again for a different mix.

import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const TITLE_FONT = new URL(
  '../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2',
  import.meta.url,
);

// Top to bottom in each list
const TASKS = {
  Today: [
    'Buy birthday present for Sam by friday',
    'Send invoice due today',
    'Call mum',
    'Book dentist',
  ],
  Week: ['Get groceries', 'Water the plants', 'Fix bike tyre'],
  Month: ['Renew passport by 14 dec', 'Book flights to Perth', 'Clean out the garage'],
  Later: ['Learn to make sourdough', 'Repaint the bedroom'],
};

// The app's colours for each theme (src/app.css)
const THEMES = {
  light: {
    bg: 'whitesmoke',
    text: '#1b1c1f',
    muted: '#5f6269',
    onText: '#ffffff',
    edge: '0 0 0 1px rgb(0 0 0 / 0.1)',
    lift: '0 0 0 1px rgb(0 0 0 / 0.1), 0 16px 48px rgb(0 0 0 / 0.16)',
  },
  dark: {
    bg: '#000000',
    text: '#e3e4e6',
    muted: '#888b92',
    onText: '#121314',
    edge: '0 0 0 1px rgb(255 255 255 / 0.14), 0 0 48px rgb(255 255 255 / 0.08)',
    lift: '0 0 0 1px rgb(255 255 255 / 0.2), 0 16px 48px rgb(0 0 0 / 0.8)',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });
const font = (await readFile(TITLE_FONT)).toString('base64');
const png = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

/** Screenshots of one set of example tasks, at each size the images need. */
async function screenshots(colorScheme) {
  const context = await browser.newContext({ deviceScaleFactor: 2, colorScheme });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(APP);
  await page.getByLabel('New task in Today').waitFor();
  // The first visit adds the demo tasks and notes that it did; clear them so they stay gone.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('dumb-tasks');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('tasks', 'readwrite');
          tx.objectStore('tasks').clear();
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  for (const [list, tasks] of Object.entries(TASKS)) {
    const add = page.getByLabel(`New task in ${list}`);
    // Each new task lands at the top of its list, so they're typed in reverse
    for (const text of [...tasks].reverse()) {
      await add.fill(text);
      await add.press('Enter');
    }
    await add.blur();
  }

  const shot = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    return png(await page.screenshot());
  };
  const shots = {
    desktop: await shot(1280, 800),
    card: await shot(1200, 520),
    phone: await shot(390, 700),
  };
  await context.close();
  return shots;
}

/** Renders a page of HTML to a PNG at the given size. */
async function render(html, theme, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(`<!doctype html>
<style>
  @font-face {
    font-family: 'Inter Display';
    font-weight: 100 900;
    src: url(data:font/woff2;base64,${font}) format('woff2-variations');
  }
  body {
    position: relative;
    margin: 0;
    width: ${width}px;
    height: ${height}px;
    overflow: hidden;
    background: ${theme.bg};
    color: ${theme.text};
    font-family: 'Inter Display', system-ui, sans-serif;
    font-variation-settings: 'opsz' 32;
  }
  .mark {
    width: 0.8em;
    height: 0.8em;
    margin-right: 0.3em;
    vertical-align: -0.05em;
  }
  .mark circle { fill: ${theme.text}; }
  .mark path { fill: none; stroke: ${theme.onText}; stroke-width: 2; }
  .window {
    position: absolute;
    overflow: hidden;
  }
  .window img { display: block; width: 100%; }
</style>
${html}`);
  await page.evaluate(() => document.fonts.ready);
  const out = new URL(`../${file}`, import.meta.url);
  await page.screenshot({ path: out.pathname });
  await page.close();
  console.log(`Wrote ${out.pathname}`);
}

const MARK = `<svg class="mark" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" /><path d="M4.5 8.3 7 10.8 11.5 5.5" /></svg>`;

// The link card: logo and tagline on one line, the desktop layout below running off the bottom
const light = await screenshots('light');
await render(
  `<style>
    header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 56px 64px 0;
    }
    h1 { margin: 0; font-size: 64px; font-weight: 700; letter-spacing: -0.02em; }
    p { margin: 0; color: ${THEMES.light.muted}; font-size: 40px; font-weight: 500; }
    .window {
      left: 64px;
      right: 64px;
      top: 170px;
      border-radius: 16px 16px 0 0;
      box-shadow: ${THEMES.light.edge};
    }
  </style>
  <header><h1>${MARK}dumb tasks</h1><p>A really simple todo list</p></header>
  <div class="window"><img src="${light.card}" /></div>`,
  THEMES.light,
  1200,
  630,
  'public/og-image.png',
);

// The README: the desktop layout, with the phone layout over its corner
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  const shots = name === 'light' ? light : await screenshots(name);
  await render(
    `<style>
      .desktop {
        left: 80px;
        top: 72px;
        width: 1120px;
        border-radius: 16px 16px 0 0;
        box-shadow: ${theme.edge};
      }
      .phone {
        left: 1140px;
        top: 150px;
        width: 380px;
        border-radius: 28px 28px 0 0;
        box-shadow: ${theme.lift};
      }
    </style>
    <div class="window desktop"><img src="${shots.desktop}" /></div>
    <div class="window phone"><img src="${shots.phone}" /></div>`,
    theme,
    1600,
    600,
    `docs/preview${name === 'light' ? '' : '-dark'}.png`,
  );
}

await browser.close();
