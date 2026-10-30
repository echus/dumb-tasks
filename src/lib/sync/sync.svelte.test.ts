// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://dumbtasks.app/"}
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SCHEMA_VERSION } from './data-file';
import { FakeDav } from './fake-dav';
import { FakeDrive } from './fake-drive';
import { serve } from './fake-server';

// The sync module keeps its state per tab, so each tab here is a fresh copy of it. All tabs
// share one database and one set of locks, as tabs on one device do.

type Tab = typeof import('./sync.svelte');

// Google's sign-in popup and the Worker behind it, faked: who is signed in to Google in this
// browser, and whether the Worker still holds a sign-in to hand out new tokens with
const { google, resetGoogle } = vi.hoisted(() => {
  const fresh = () => ({
    clientId: undefined as string | undefined, // undefined: a build without Drive
    account: 'me@example.com',
    quietSignIn: true, // a sign-in with the account named closes on its own
    workerSignedIn: false,
    tokens: new Map<string, { email: string; expiresAt: number }>(), // the ones Drive takes
    issued: 0,
    signIns: [] as (string | undefined)[], // the account named, if any, for each
    refreshes: 0,
    signOuts: 0,
  });
  const google = fresh();
  return { google, resetGoogle: () => Object.assign(google, fresh()) };
});

vi.mock('./google-auth', () => {
  const token = () => {
    const value = `token${++google.issued}`;
    const expiresAt = Date.now() + 3_600_000;
    google.tokens.set(value, { email: google.account, expiresAt });
    return { value, expiresAt, remembered: true };
  };
  return {
    get CLIENT_ID() {
      return google.clientId;
    },
    loadGoogle: async () => ({}),
    signIn: async (loginHint?: string) => {
      google.signIns.push(loginHint);
      if (loginHint && !google.quietSignIn) throw new Error('Cannot open the Google sign-in.');
      google.workerSignedIn = true;
      return token();
    },
    refreshToken: async () => {
      google.refreshes++;
      return google.workerSignedIn ? token() : null;
    },
    signOut: async () => {
      google.signOuts++;
      google.workerSignedIn = false;
    },
  };
});

let dav: FakeDav;
let other: FakeDav; // a second server, to switch to
let drive: FakeDrive;
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
  resetGoogle();
  dav = new FakeDav();
  other = new FakeDav('https://dav.example.org/files/', 'someone', 'other secret');
  drive = new FakeDrive();
  drive.tokens = google.tokens;
  fetchSpy = vi.fn(serve(dav, other, drive));
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(navigator, 'locks', { value: fakeLocks(), configurable: true });
  // No syncs every minute, only the ones asked for. Date: to let tokens run out
  vi.useFakeTimers({ toFake: ['setInterval', 'Date'] });
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
    expect(google.clientId).toBeUndefined();
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

  it('clears the ask to reload for a newer version', async () => {
    dav.add('device-newer.json', JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, tasks: [] }));
    const a = await openTab();
    await a.connectWebDav(dav.root, dav.username, dav.password);
    const b = await openTab();
    expect(a.sync.needsUpdate).toBe(true);

    await b.disconnect();
    await a.syncNow();
    expect(a.sync).toMatchObject({ service: null, needsUpdate: false, error: '' });
  });
});

describe('a sync that finishes late in another tab', () => {
  it('does not put back the connection this tab replaced', async () => {
    const a = await connectedTab();
    const b = await openTab();

    // Tab A's sync waits on a slow server, while tab B switches to another one
    const { arrived, release } = dav.gate.hold();
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

describe('Google Drive', () => {
  beforeEach(() => {
    google.clientId = 'client-id';
  });

  /** A newly opened tab, connected to Drive. */
  async function driveTab(): Promise<Tab> {
    const tab = await openTab();
    await tab.connectDrive();
    expect(tab.sync).toMatchObject({ service: 'drive', account: 'me@example.com', error: '' });
    return tab;
  }

  /** The saved token runs out. */
  const anHourLater = () => vi.setSystemTime(Date.now() + 3_600_000);

  /** Signed out: the token runs out, and the Worker can't get a new one. */
  async function signOutOf(tab: Tab) {
    google.workerSignedIn = false;
    anHourLater();
    await tab.syncNow();
    expect(tab.sync.needsSignIn).toBe(true);
  }

  it('gets a new token without a popup once the saved one runs out', async () => {
    const tab = await driveTab();
    anHourLater();
    drive.calls = [];
    await tab.syncNow();
    expect(google).toMatchObject({ refreshes: 1, signIns: [undefined] });
    expect(tab.sync).toMatchObject({ needsSignIn: false, error: '' });
    expect(drive.calls).not.toEqual([]);
  });

  it('asks to sign in again when the Worker has no sign-in left, without asking Drive', async () => {
    const tab = await driveTab();
    drive.calls = [];
    await signOutOf(tab);
    expect(drive.calls).toEqual([]);
  });

  it('gets one new token when Drive ends the old one early', async () => {
    const tab = await driveTab();
    google.tokens.clear();
    await tab.syncNow();
    expect(google.refreshes).toBe(1);
    expect(tab.sync).toMatchObject({ needsSignIn: false, error: '' });
  });

  it('asks to sign in again when Drive turns down the new token too', async () => {
    const tab = await driveTab();
    drive.failWith = 401;
    await tab.syncNow();
    expect(google.refreshes).toBe(1);
    expect(tab.sync.needsSignIn).toBe(true);
  });

  it('refuses to sign in again as another account, and signs that one out', async () => {
    const tab = await driveTab();
    await signOutOf(tab);
    google.account = 'other@example.com';
    await tab.reconnectDrive();
    expect(tab.sync).toMatchObject({
      account: 'me@example.com',
      needsSignIn: true,
      error: 'This is other@example.com, not me@example.com. To use a different account, disconnect first.',
    });
    expect(google.signOuts).toBe(1);
  });

  it('opens the full sign-in on the next click when the quick one fails', async () => {
    const tab = await driveTab();
    await signOutOf(tab);
    google.quietSignIn = false;
    await tab.reconnectDrive();
    expect(tab.sync.error).not.toBe('');

    await tab.reconnectDrive();
    expect(google.signIns).toEqual([undefined, 'me@example.com', undefined]);
    expect(tab.sync).toMatchObject({ needsSignIn: false, error: '' });
  });

  it('is not put back by a late sync in another tab, after a switch to WebDAV', async () => {
    const a = await driveTab();
    const b = await openTab();

    const { arrived, release } = drive.gate.hold();
    const late = a.syncNow();
    await arrived;
    const switched = (async () => {
      await b.disconnect();
      await b.connectWebDav(dav.root, dav.username, dav.password);
    })();
    await new Promise((resolve) => setTimeout(resolve, 50)); // see the WebDAV test above
    release();
    await Promise.all([late, switched]);

    await a.syncNow();
    await b.syncNow();
    expect(b.sync.service).toBe('webdav');
    expect(a.sync.service).toBe('webdav');
  });
});
