import { expect, test } from '@playwright/test';

// The task list in a real browser: the build works, and IndexedDB keeps the tasks.

test('keeps a task through a reload, and moves it to the done rows once done', async ({ page }) => {
  await page.goto('/');
  const newTask = page.getByLabel('New task in Today');
  await newTask.fill('Water the basil');
  await newTask.press('Enter');
  const task = page.getByRole('button', { name: 'Edit Water the basil' });
  await expect(task).toBeVisible();

  await page.reload();
  await expect(task).toBeVisible();
  await page.getByRole('listitem').filter({ has: task }).getByRole('button', { name: 'Mark done' }).click();
  await expect(task).toBeHidden();
  const undo = page.getByRole('button', { name: 'Mark not done: Water the basil' });
  await expect(undo).toBeVisible();
  await expect(page.getByText('1 done today')).toBeVisible();

  await page.reload();
  await expect(task).toBeHidden();
  await expect(undo).toBeVisible();

  await undo.click();
  await expect(task).toBeVisible();
  await expect(undo).toBeHidden();
});

test('deletes a done task', async ({ page }) => {
  await page.goto('/');
  const newTask = page.getByLabel('New task in Today');
  await newTask.fill('Water the basil');
  await newTask.press('Enter');
  await page.getByRole('listitem').filter({ hasText: 'Water the basil' }).getByRole('button', { name: 'Mark done' }).click();
  const undo = page.getByRole('button', { name: 'Mark not done: Water the basil' });
  await undo.hover();
  await page.getByRole('button', { name: 'Delete Water the basil' }).click();
  await expect(undo).toBeHidden();
  await expect(page.getByRole('button', { name: /done today/ })).toBeHidden();

  await page.reload();
  await expect(page.getByText('Water the basil')).toBeHidden();
});

test('closes the done rows in every list, and keeps them closed', async ({ page }) => {
  await page.goto('/');
  const newTask = page.getByLabel('New task in Today');
  await newTask.fill('Water the basil');
  await newTask.press('Enter');
  await page.getByRole('listitem').filter({ hasText: 'Water the basil' }).getByRole('button', { name: 'Mark done' }).click();
  const toggle = page.getByRole('button', { name: '1 done today' });
  const undo = page.getByRole('button', { name: 'Mark not done: Water the basil' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(undo).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(undo).toBeHidden();

  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(undo).toBeVisible();
});

test('shows done tasks by day, and closes with the back button', async ({ page }) => {
  await page.goto('/');
  const newTask = page.getByLabel('New task in Today');
  await newTask.fill('Water the basil');
  await newTask.press('Enter');
  await page.getByRole('listitem').filter({ hasText: 'Water the basil' }).getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByRole('button', { name: '1 done today' })).toBeVisible();

  await page.getByRole('button', { name: 'Done tasks', exact: true }).click();
  await expect(page).toHaveURL(/#done$/);
  await expect(page.getByRole('list', { name: /today 1 done/ })).toContainText('Water the basil');
  await expect(page.getByLabel('New task in Today')).toBeHidden();

  await page.goBack();
  await expect(page.getByLabel('New task in Today')).toBeVisible();

  await page.getByRole('button', { name: 'See all done tasks' }).first().click();
  await page.getByRole('button', { name: 'Back to tasks' }).click();
  await expect(page.getByLabel('New task in Today')).toBeVisible();
  await expect(page).not.toHaveURL(/#done/);

  // Opened straight at #done, back to tasks stays in the app
  await page.goto('/#done');
  await page.getByRole('button', { name: 'Back to tasks' }).click();
  await expect(page.getByLabel('New task in Today')).toBeVisible();
});

test('puts the caret where the text was clicked, to edit it there', async ({ page }) => {
  await page.goto('/');
  const newTask = page.getByLabel('New task in Today');
  await newTask.fill('Water the basil');
  await newTask.press('Enter');
  const task = page.getByRole('button', { name: 'Edit Water the basil' });
  const box = (await task.boundingBox())!;
  const text = task.locator('span').first();
  const start = (await text.boundingBox())!;
  await page.mouse.click(start.x + 1, box.y + box.height / 2); // just before the first letter

  await page.keyboard.type('Go and ');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Edit Go and Water the basil' })).toBeVisible();
});

test('opens offline, with its tasks, once it has been opened', async ({ page, context }) => {
  await page.goto('/');
  const newTask = page.getByLabel('New task in Today');
  await newTask.fill('Pack the tent');
  await newTask.press('Enter');
  // The service worker has the app's files once it's ready
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit Pack the tent' })).toBeVisible();
});
