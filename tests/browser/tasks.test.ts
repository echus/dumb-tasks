import { expect, test } from '@playwright/test';

// The task list in a real browser: the build works, and IndexedDB keeps the tasks.

test('keeps a task through a reload, and drops it once done', async ({ page }) => {
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

  await page.reload();
  await expect(newTask).toBeVisible();
  await expect(task).toBeHidden();
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
