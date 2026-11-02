// Makes the 1200×630 card shown when someone shares a link to the app: public/og-image.png
// (light), and public/og-image-dark.png for the top of the README in dark mode. Takes a
// phone-sized screenshot of the real app with a few example tasks, then lays it out beside
// the logo and tagline.
//
// Start the dev server (npm run dev), then: node scripts/make-preview-image.js
// Uses the Chrome installed on this computer, so the emoji are the system's own. Circle
// colours are random, so run it again for a different mix.

import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const TITLE_FONT = new URL(
  '../node_modules/@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2',
  import.meta.url,
);

// Top to bottom. Each new task lands at the top of the list, so they're typed in reverse.
const TASKS = [
  'Buy birthday present for Sam by friday',
  'Send invoice due today',
  'Book dentist',
  'Call mum',
  'Renew passport by 14 dec',
  'Water the plants',
  'Reply to Jo about the trip',
];

// The app's colours for each theme (src/app.css)
const THEMES = {
  light: {
    file: 'og-image.png',
    bg: 'whitesmoke',
    text: '#1b1c1f',
    muted: '#5f6269',
    onText: '#ffffff',
    edge: '0 0 0 1px rgb(0 0 0 / 0.1)',
  },
  dark: {
    file: 'og-image-dark.png',
    bg: '#000000',
    text: '#e3e4e6',
    muted: '#888b92',
    onText: '#121314',
    edge: '0 0 0 1px rgb(255 255 255 / 0.14), 0 0 48px rgb(255 255 255 / 0.08)',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });

async function screenshotApp(colorScheme) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 580 }, // runs off the bottom of the card
    deviceScaleFactor: 2,
    colorScheme,
  });
  await page.goto(APP);
  await page.getByPlaceholder('add a task').first().waitFor();
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
  const add = page.getByPlaceholder('add a task').first();
  for (const text of [...TASKS].reverse()) {
    await add.fill(text);
    await add.press('Enter');
  }
  await add.blur();
  await page.waitForTimeout(500);
  const png = await page.screenshot();
  await page.close();
  return png;
}

const font = (await readFile(TITLE_FONT)).toString('base64');

for (const [name, theme] of Object.entries(THEMES)) {
  const app = (await screenshotApp(name)).toString('base64');
  const out = new URL(`../public/${theme.file}`, import.meta.url);
  const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await card.setContent(`<!doctype html>
<style>
  @font-face {
    font-family: 'Inter Display';
    font-weight: 100 900;
    src: url(data:font/woff2;base64,${font}) format('woff2-variations');
  }
  body {
    margin: 0;
    width: 1200px;
    height: 630px;
    overflow: hidden;
    display: flex;
    background: ${theme.bg};
    color: ${theme.text};
    font-family: 'Inter Display', system-ui, sans-serif;
    font-variation-settings: 'opsz' 32;
  }
  .text {
    flex: 1;
    padding: 96px 0 0 80px;
  }
  h1 {
    margin: 0;
    font-size: 76px;
    font-weight: 700;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }
  .mark {
    width: 0.8em;
    height: 0.8em;
    margin-right: 0.3em;
    vertical-align: -0.05em;
  }
  .mark circle { fill: ${theme.text}; }
  .mark path { fill: none; stroke: ${theme.onText}; stroke-width: 2; }
  .tagline {
    margin: 20px 0 48px;
    font-size: 44px;
    font-weight: 500;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    color: ${theme.muted};
    font-size: 28px;
    font-weight: 500;
    line-height: 1.6;
  }
  .phone {
    width: 390px;
    margin: 56px 80px 0 0;
    border-radius: 24px 24px 0 0;
    box-shadow: ${theme.edge};
    overflow: hidden;
    align-self: flex-start;
  }
  .phone img { display: block; width: 390px; }
</style>
<div class="text">
  <h1><svg class="mark" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" /><path d="M4.5 8.3 7 10.8 11.5 5.5" /></svg>dumb tasks</h1>
  <p class="tagline">A really simple todo list</p>
  <ul>
    <li>Works offline with no account</li>
    <li>Syncs with Google Drive or WebDAV</li>
    <li>Open source</li>
  </ul>
</div>
<div class="phone"><img src="data:image/png;base64,${app}" /></div>`);
  await card.evaluate(() => document.fonts.ready);
  await card.screenshot({ path: out.pathname });
  await card.close();
  console.log(`Wrote ${out.pathname}`);
}
await browser.close();
