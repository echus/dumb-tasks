import { devices, expect, test, type Locator, type Page } from '@playwright/test';

// Dragging tasks in a real browser: with a mouse on a wide screen, where every list shows,
// and with a finger on a phone, where the lists are tabs.

type Point = { x: number; y: number };

async function centreOf(target: Locator): Promise<Point> {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The tasks in a list, top to bottom. */
const tasksIn = (page: Page, bucket: string) =>
  page
    .locator(`#panel-${bucket} li[data-task-id] button.text`)
    .evaluateAll((buttons) => buttons.map((b) => b.textContent!.trim()));

const row = (page: Page, text: string) => page.locator('li[data-task-id]').filter({ hasText: text });

/** Opens the app, once the demo tasks show. */
async function open(page: Page) {
  await page.goto('/');
  await expect(row(page, 'Drag me to another list')).toBeVisible();
}

async function add(page: Page, bucket: string, text: string) {
  const field = page.getByLabel(`New task in ${bucket}`);
  await field.fill(text);
  await field.press('Enter');
  await expect(row(page, text)).toBeVisible();
}

test.describe('with a mouse', () => {
  /** Picks the task up by moving the mouse with the button down, and lets go at `to`. */
  async function drag(page: Page, task: Locator, to: Point) {
    const from = await centreOf(task);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 20 });
    await page.mouse.up();
  }

  test('moves a task up its list, and into another list', async ({ page }) => {
    await open(page);
    await add(page, 'Week', 'second');
    await add(page, 'Week', 'first'); // new tasks go on top
    await expect.poll(() => tasksIn(page, 'week')).toEqual(['first', 'second']);

    // Its middle just above the top task's: it goes first
    const top = (await row(page, 'first').boundingBox())!;
    await drag(page, row(page, 'second'), { x: top.x + top.width / 2, y: top.y + 2 });
    await expect.poll(() => tasksIn(page, 'week')).toEqual(['second', 'first']);

    // Into Week, between its two tasks
    const between = (await row(page, 'first').boundingBox())!;
    await drag(page, row(page, 'Drag me to another list'), { x: between.x + 40, y: between.y + 2 });
    await expect.poll(() => tasksIn(page, 'week')).toEqual(['second', 'Drag me to another list', 'first']);
    expect(await tasksIn(page, 'today')).not.toContain('Drag me to another list');

    await page.reload();
    await expect.poll(() => tasksIn(page, 'week')).toEqual(['second', 'Drag me to another list', 'first']);
  });

  test('leaves the task where it was when dropped on its own spot', async ({ page }) => {
    await open(page);
    const before = await tasksIn(page, 'today');
    const task = row(page, 'Add some tasks today');
    const at = await centreOf(task);
    await drag(page, task, { x: at.x + 30, y: at.y }); // sideways, past the slop
    await expect.poll(() => tasksIn(page, 'today')).toEqual(before);
  });
});

test.describe('with a finger', () => {
  // A phone's screen and touch, in the same Chrome (its browser type can't change here)
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  test.use(phone);

  /** A finger on the screen, through Chrome's own touch input, as Playwright has no touch drag. */
  async function finger(page: Page) {
    const cdp = await page.context().newCDPSession(page);
    let at: Point = { x: 0, y: 0 };
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd') =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [at] });
    return {
      async down(point: Point) {
        at = point;
        await send('touchStart');
      },
      /** Slides there in small steps, as a finger does. */
      async move(to: Point) {
        const from = at;
        for (let i = 1; i <= 10; i++) {
          at = { x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 };
          await send('touchMove');
        }
      },
      up: () => send('touchEnd'),
    };
  }

  const tab = (page: Page, bucket: string) => page.locator(`[data-tab="${bucket}"]`);

  test('drops a long-pressed task on a tab, at the end of that list', async ({ page }) => {
    await open(page);
    const touch = await finger(page);
    await touch.down(await centreOf(row(page, 'Drag me to another list')));
    await page.waitForTimeout(400); // a long press picks the task up
    await touch.move(await centreOf(tab(page, 'week')));
    await touch.up();

    await expect.poll(() => tasksIn(page, 'today')).not.toContain('Drag me to another list');
    await tab(page, 'week').click();
    await expect.poll(() => tasksIn(page, 'week')).toEqual(['Drag me to another list']);
  });

  test('opens a tab held over, to drop the task anywhere in its list', async ({ page }) => {
    await open(page);
    await tab(page, 'week').click();
    await add(page, 'Week', 'already here');
    await tab(page, 'today').click();

    const touch = await finger(page);
    await touch.down(await centreOf(row(page, 'Drag me to another list')));
    await page.waitForTimeout(400);
    await touch.move(await centreOf(tab(page, 'week')));
    await expect(tab(page, 'week')).toHaveAttribute('aria-selected', 'true'); // after half a second
    const top = (await row(page, 'already here').boundingBox())!;
    await touch.move({ x: top.x + top.width / 2, y: top.y + 2 });
    await touch.up();

    await expect.poll(() => tasksIn(page, 'week')).toEqual(['Drag me to another list', 'already here']);
  });

  test('scrolls the page, not the task, when the finger moves straight away', async ({ page }) => {
    await open(page);
    const before = await tasksIn(page, 'today');
    const touch = await finger(page);
    const at = await centreOf(row(page, 'Drag me to another list'));
    await touch.down(at);
    await touch.move({ x: at.x, y: at.y + 150 });
    await touch.up();
    await expect(page.locator('.drag-preview')).toHaveCount(0);
    expect(await tasksIn(page, 'today')).toEqual(before);
  });
});
