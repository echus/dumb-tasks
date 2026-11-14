// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://dumbtasks.app/"}
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION } from '$lib/sync/data-file';
import { FakeDav } from '../helpers/fake-dav';
import { FakeDrive } from '../helpers/fake-drive';
import { fakeGoogle } from '../helpers/fake-google';
import { serve } from '../helpers/fake-server';
import { clearDevice, openTab, setUpDevice, type Tab } from '../helpers/test-device';

// The menu with the real sync module behind it, clicked through as a person would. The
// servers and Google's sign-in are faked.

// Built when a tab first loads the sync module, after this file's top level has run
vi.mock('$lib/sync/google-auth', () => google.module);
vi.mock('$lib/config', () => google.config);
const google = fakeGoogle();

let dav: FakeDav;
let drive: FakeDrive;
let target: HTMLElement;
let svelte: typeof import('svelte'); // the last tab's: each tab has its own copy of Svelte too
let closeMenus: (() => void)[] = [];

/** A newly opened tab, with the sync menu open in it. */
async function openMenu(): Promise<Tab> {
  const tab = await openTab();
  // Straight after openTab, so they're this tab's
  svelte = await import('svelte');
  const { default: SyncMenu } = await import('../../src/components/SyncMenu.svelte');
  target = document.body.appendChild(document.createElement('div'));
  const { mount, unmount } = svelte;
  const menu = mount(SyncMenu, { target });
  closeMenus.push(() => unmount(menu));
  flushSync();
  target.querySelector<HTMLButtonElement>('.icon-button')!.click();
  flushSync();
  return tab;
}

const flushSync = () => svelte.flushSync();

/** What the open menu says, spaces tidied. */
const text = () => target.querySelector('[role=dialog]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const buttons = () => [...target.querySelectorAll('button')];
const pills = () => [...target.querySelectorAll('[role=tab]')].map((p) => p.textContent?.trim());
const chosen = () => target.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim();
const hasButton = (name: string) => buttons().some((b) => b.textContent?.trim() === name);

function click(name: string) {
  const button = buttons().find((b) => b.textContent?.trim() === name);
  if (!button) throw new Error(`No ${name} button. The menu says: ${text()}`);
  button.click();
  flushSync();
}

function fill(label: string, value: string) {
  const input = [...target.querySelectorAll('label')]
    .find((l) => l.textContent?.trim().startsWith(label))
    ?.querySelector('input');
  if (!input) throw new Error(`No ${label} field. The menu says: ${text()}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

function connectWithForm(password = dav.password) {
  click('Connect WebDAV');
  fill('Folder address', dav.root);
  fill('Username', dav.username);
  fill('Password', password);
  click('Connect');
}

const shows = (words: string) => vi.waitFor(() => expect(text()).toContain(words));

beforeEach(() => {
  google.reset();
  dav = new FakeDav();
  drive = new FakeDrive();
  drive.tokens = google.tokens;
  vi.stubGlobal('fetch', serve(dav, drive));
  setUpDevice();
});

afterEach(async () => {
  for (const close of closeMenus) close();
  closeMenus = [];
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  await clearDevice();
});

describe('the WebDAV option', () => {
  it('connects from the form, then clears and closes it', async () => {
    await openMenu();
    connectWithForm();
    await shows('me on cloud.example.com');
    expect(target.querySelector('form')).toBeNull();

    click('Disconnect');
    await shows('Connect WebDAV');
    click('Connect WebDAV');
    expect([...target.querySelectorAll('input:not([type=file])')].map((i) => (i as HTMLInputElement).value)).toEqual([
      '',
      '',
      '',
    ]);
  });

  it('says Syncing, not the last sync time, while an edit waits to sync', async () => {
    const tab = await openMenu();
    const { addTask, editText } = await import('$lib/tasks/tasks'); // this tab's
    const id = (await addTask('buy milk'))!;
    connectWithForm();
    // The push may wait for the gap WebDAV leaves between writes
    await vi.waitFor(() => expect(text()).toContain('Synced just now'), { timeout: 3_000 });
    await editText(id, 'buy oat milk');
    await shows('Syncing');
    await tab.syncNow();
    await shows('Synced just now');
  });

  it('keeps the form, with the error in it, when the server turns down the sign-in', async () => {
    await openMenu();
    connectWithForm('wrong');
    await shows('The WebDAV server did not accept the username or password.');
    expect(target.querySelector('form')).not.toBeNull();
    expect(chosen()).toBe('WebDAV');
  });

  it('asks for the password again when the server turns it down, and signs in with it', async () => {
    const tab = await openMenu();
    await tab.connectWebDav(dav.root, dav.username, dav.password);
    dav.password = 'changed';
    click('Sync now');
    await shows('The server did not accept the saved password.');

    fill('Password', 'changed');
    click('Sign in again');
    await shows('Synced just now');
    expect(target.querySelector('form')).toBeNull();
  });

  it('connects from the form after another tab disconnected a signed-out connection', async () => {
    const tab = await openMenu();
    await tab.connectWebDav(dav.root, dav.username, dav.password);
    const other = await openTab();
    dav.password = 'changed';
    click('Sync now');
    await shows('The server did not accept the saved password.');
    await other.syncNow();

    await other.disconnect();
    await tab.syncNow(); // as when this tab comes back into view
    await shows('Connect WebDAV');
    connectWithForm('changed');
    await shows('me on cloud.example.com');
  });

  it('offers Reload in place of Sync now once another device has a newer version', async () => {
    dav.add('device-newer.json', JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, tasks: [] }));
    const tab = await openMenu();
    await tab.connectWebDav(dav.root, dav.username, dav.password);
    await shows('Another device synced with a newer version of Dumb Tasks.');
    expect(hasButton('Reload')).toBe(true);
    expect(hasButton('Sync now')).toBe(false);
  });
});

describe('the Google Drive option', () => {
  it('is only there in a build with Drive', async () => {
    await openMenu();
    expect(text()).not.toContain('Google Drive');
    expect(pills()).toEqual(['WebDAV', 'Manual']);
    expect(chosen()).toBe('WebDAV');
  });

  it('signs in to Drive again after Google signed this device out', async () => {
    google.clientId = 'client-id';
    await openMenu();
    click('Connect Google Drive');
    await shows('me@example.com');

    google.workerSignedIn = false;
    google.tokens.clear();
    click('Sync now');
    await shows('Google signed out this device.');
    click('Sign in again');
    await shows('Synced just now');
    expect(google.signIns).toEqual([undefined, 'me@example.com']);
  });
});

describe('the sync section', () => {
  it('has a pill for each way to keep tasks, and opens on Drive', async () => {
    google.clientId = 'client-id';
    await openMenu();
    expect(pills()).toEqual(['Google Drive', 'WebDAV', 'Manual']);
    expect(chosen()).toBe('Google Drive');

    click('Manual');
    expect(chosen()).toBe('Manual');
    expect(hasButton('Save backup')).toBe(true);
    expect(hasButton('Connect Google Drive')).toBe(false);
  });

  it('opens on the connected service', async () => {
    google.clientId = 'client-id';
    const tab = await openMenu();
    await tab.connectWebDav(dav.root, dav.username, dav.password);
    await shows('Synced just now'); // the first sync done, so it does not run into the next test
    expect(chosen()).toBe('WebDAV');
  });
});
