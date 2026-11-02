import { expect, test, type Browser, type Page } from '@playwright/test';
import { emptyServer, type Server } from '../servers/servers.ts';

// WebDAV sync in a real browser, between two devices: so the browser's own CORS checks run
// against each real server, set up as the README says.

const servers: Server[] = JSON.parse(process.env.SERVERS ?? '[]');

/** A new device (its own storage) with the app open and connected to the server. */
async function connectedDevice(browser: Browser, server: Server): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sync and backup' }).click();
  await page.getByRole('button', { name: 'Connect WebDAV' }).click();
  await page.getByLabel('Folder address').fill(server.url);
  await page.getByLabel('Username').fill(server.username);
  await page.getByLabel('Password').fill(server.password);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByText(`${server.username} on ${new URL(server.url).host}`)).toBeVisible();
  await expect(page.getByText('Synced just now')).toBeVisible();
  await page.keyboard.press('Escape');
  return page;
}

async function syncNow(page: Page) {
  await page.getByRole('button', { name: /^Synced with WebDAV|^Sync needs attention/ }).click();
  const button = page.getByRole('button', { name: 'Sync now' });
  await expect(button).toBeEnabled(); // not while a sync is still going
  await button.click();
  await expect(page.locator('.error')).toHaveCount(0);
  await page.keyboard.press('Escape');
}

/** Waits for the device to write its file to the server with this text in it. */
const uploaded = (page: Page, text: string) =>
  page.waitForResponse((res) => res.request().method() === 'PUT' && !!res.request().postData()?.includes(text));

for (const server of servers) {
  test(`syncs a task to another device through ${server.name}`, async ({ browser }) => {
    await emptyServer(server);
    const laptop = await connectedDevice(browser, server);
    const phone = await connectedDevice(browser, server);

    const newTask = laptop.getByLabel('New task in Today');
    await newTask.fill('Call the plumber');
    const upload = uploaded(laptop, 'Call the plumber');
    await newTask.press('Enter'); // syncs a few seconds after the edit
    expect((await upload).ok()).toBe(true);

    await syncNow(phone);
    await expect(phone.getByRole('button', { name: 'Edit Call the plumber' })).toBeVisible();
  });
}

test('has servers to sync with', () => {
  expect(servers.map((s) => s.name)).toEqual(['Apache', 'Nextcloud']);
});
