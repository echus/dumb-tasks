// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://dumbtasks.app/"}
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { FakeDav, serve } from './fake-dav';

// The sync module keeps its state per tab, so each tab here is a fresh copy of it. All tabs
// share one database and one set of locks, as tabs on one device do. Tests run as a build
// without Google Drive (see vite.config.ts), so these use WebDAV.

type Tab = typeof import('./sync.svelte');

let dav: FakeDav;
let other: FakeDav; // a second server, to switch to
let fetchSpy: Mock<typeof fetch>;

/** A newly opened tab of the app. */
async function openTab(): Promise<Tab> {
  vi.resetModules();
  const tab = await import('./sync.svelte');
  await tab.startSync();
  return tab;
}

/** A newly opened tab, connected to the server. */
async function connectedTab(server = dav): Promise<Tab> {
  const tab = await openTab();
  await tab.connectWebDav(server.root, server.username, server.password);
  expect(tab.sync.error).toBe('');
  return tab;
}

/** navigator.locks, which jsdom doesn't have: requests for a name run one at a time, in order. */
function fakeLocks() {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request(name: string, fn: () => Promise<unknown>) {
      const run = (queues.get(name) ?? Promise.resolve()).then(fn);
      queues.set(name, run.catch(() => {}));
      return run;
    },
  };
}

beforeEach(() => {
  dav = new FakeDav();
  other = new FakeDav('https://dav.example.org/files/', 'someone', 'other secret');
  fetchSpy = vi.fn(serve(dav, other));
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(navigator, 'locks', { value: fakeLocks(), configurable: true });
  vi.useFakeTimers({ toFake: ['setInterval'] }); // no syncs every minute, only the ones asked for
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Dexie.delete('dumb-tasks');
});

describe('a password the server turns down', () => {
  it('is not sent again, so the server does not lock out this address', async () => {
    const tab = await connectedTab();
    dav.password = 'changed';
    await tab.syncNow();
    expect(tab.sync.needsSignIn).toBe(true);

    dav.calls = [];
    await tab.syncNow();
    await tab.syncNow();
    expect(dav.calls).toEqual([]);
  });

  it('is replaced by signing in again', async () => {
    const tab = await connectedTab();
    dav.password = 'changed';
    await tab.syncNow();

    await tab.reconnectWebDav('changed');
    expect(tab.sync).toMatchObject({ needsSignIn: false, error: '' });
    dav.calls = [];
    await tab.syncNow();
    expect(dav.calls).not.toEqual([]);
  });

  it('is replaced by signing in again in another tab', async () => {
    const a = await connectedTab();
    const b = await openTab();
    dav.password = 'changed';
    await a.syncNow();
    await b.syncNow();

    await b.reconnectWebDav('changed');
    dav.calls = [];
    await a.syncNow();
    expect(a.sync.needsSignIn).toBe(false);
    expect(dav.calls).not.toEqual([]);
  });
});

describe('a build without Google Drive', () => {
  it('ignores Drive settings saved by a build with it, until a WebDAV connect replaces them', async () => {
    vi.resetModules();
    const { db } = await import('../db');
    const token = { value: 'token', expiresAt: Date.now() + 3_600_000 };
    await db.settings.put({ key: 'drive', value: JSON.stringify({ email: 'me@example.com', token }) });

    const tab = await openTab();
    expect(tab.sync.service).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    await tab.connectWebDav(dav.root, dav.username, dav.password);
    expect(tab.sync.service).toBe('webdav');
    expect(await db.settings.get('drive')).toBeUndefined();
  });
});

describe('another tab disconnecting', () => {
  it('clears what this tab showed about the old connection', async () => {
    const a = await connectedTab();
    const b = await openTab();
    dav.password = 'changed';
    await a.syncNow();
    await b.syncNow();
    expect(a.sync.needsSignIn).toBe(true);

    await b.disconnect();
    await a.syncNow();
    expect(a.sync).toMatchObject({ service: null, needsSignIn: false, error: '' });
  });

  it('clears an error this tab showed', async () => {
    const a = await connectedTab();
    const b = await openTab();
    dav.failWith = 500;
    await a.syncNow();
    expect(a.sync.error).not.toBe('');

    await b.disconnect();
    await a.syncNow();
    expect(a.sync).toMatchObject({ service: null, error: '' });
  });
});

describe('a sync that finishes late in another tab', () => {
  it('does not put back the connection this tab replaced', async () => {
    const a = await connectedTab();
    const b = await openTab();

    // Tab A's sync waits on a slow server, while tab B switches to another one
    const { arrived, release } = dav.hold();
    const late = a.syncNow();
    await arrived;
    const switched = (async () => {
      await b.disconnect();
      await b.connectWebDav(other.root, other.username, other.password);
    })();
    // Lets tab B get as far as it can. Without the lock it saves the new server by now;
    // with it, it waits for tab A whatever the delay
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await Promise.all([late, switched]);

    await a.syncNow();
    await b.syncNow();
    expect(b.sync.account).toBe('someone on dav.example.org');
    expect(a.sync.account).toBe('someone on dav.example.org');
  });
});
