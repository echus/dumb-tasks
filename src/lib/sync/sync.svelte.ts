import { ulid } from 'ulid';
import { db } from '../db';
import { DriveAuthError, DriveBackend, fetchEmail } from './drive';
import { SignedOutError, startFrom, syncWith } from './engine';
import { CLIENT_ID, loadGoogle, refreshToken, signIn, signOut, type AccessToken } from './google-auth';
import { onLocalChange } from './local-changes';
import { serverUrl, WebDavBackend, type WebDavAccount } from './webdav';

// When and how the app syncs, with Google Drive or a WebDAV server, and the state the sync
// menu shows. Syncs on open, when the app comes back into view or its window gets focus, a
// few seconds after each edit, and every minute. Never blocks the app: everything is saved
// locally first. A sync with nothing to do is a single small request.

const EDIT_DELAY = 3_000;
const INTERVAL = 60_000;
const FOCUS_GAP = 5_000; // focus often comes with coming into view, which already synced
const EXPIRY_MARGIN = 60_000; // don't start a sync with a token about to run out

// Device-only, in the settings table, under the service's name: one service at a time.
interface Progress {
  lastSyncedAt: string | null; // when the last sync that worked began
  cursor: string | null; // see SyncState
  pushedKey: string | null;
}

// The token is kept so syncs within its hour don't each ask the Worker for a new one; it
// only grants access to the app's own Drive folder.
interface DriveSettings extends Progress {
  service: 'drive';
  email: string;
  token: AccessToken;
  fileId: string | null; // this device's file in Drive
}

// The password is kept as entered, like the Drive token. Best an app password, which can be
// revoked on its own.
interface WebDavSettings extends Progress, WebDavAccount {
  service: 'webdav';
}

type Settings = DriveSettings | WebDavSettings;

const NOT_SYNCED: Progress = { lastSyncedAt: null, cursor: null, pushedKey: null };

/** Who and where, to tell a sign-in to the same account from one to another. */
function identity(s: Settings): string {
  return s.service === 'drive' ? `drive ${s.email}` : `webdav ${s.username} ${s.url}`;
}

export const sync = $state({
  driveAvailable: Boolean(CLIENT_ID),
  service: null as Settings['service'] | null, // null: not syncing
  account: '', // the Google email, or the WebDAV user and server
  syncing: false,
  needsSignIn: false, // the service signed this device out: signing in again fixes it
  needsUpdate: false, // a device synced from a newer version: a reload fixes it
  error: '',
  lastSyncedAt: null as string | null,
});

let settings: Settings | null = null;
let device = ''; // names this device's file: one per install, kept through reconnects
let tidied = false; // stale files cleared out since the app opened
let lastStart = 0;
let running: Promise<void> | null = null;
let again = false;
let editTimer: ReturnType<typeof setTimeout> | undefined;
// A quiet sign-in failed (e.g. signed out of Google in this browser): the next try shows
// Google's full sign-in. It can't follow straight on, as the popup needs a fresh click.
let fullSignIn = false;

async function load(): Promise<Settings | null> {
  const [drive, webdav] = await db.settings.bulkGet(['drive', 'webdav']);
  if (webdav) return { service: 'webdav', ...JSON.parse(webdav.value) };
  // Older versions saved fewer fields
  if (drive) {
    return { service: 'drive', fileId: null, cursor: null, pushedKey: null, ...JSON.parse(drive.value) };
  }
  return null;
}

/** Takes in what another tab of the app saved: a sync, a new token, a disconnect. */
async function catchUp() {
  const saved = await load();
  if (saved && settings && identity(saved) === identity(settings)) Object.assign(settings, saved);
  else {
    settings = saved;
    show();
  }
}

/** One sync at a time across this device's open tabs, as they share its file and settings. */
function oneAtATime(fn: () => Promise<void>): Promise<void> {
  // Named before WebDAV; kept so tabs still on an older version take turns with this one
  return navigator.locks ? navigator.locks.request('drive-sync', fn) : fn();
}

async function save() {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.bulkDelete(['drive', 'webdav']);
    if (settings) await db.settings.put({ key: settings.service, value: JSON.stringify(settings) });
  });
}

function show() {
  sync.service = settings?.service ?? null;
  sync.account = !settings
    ? ''
    : settings.service === 'drive'
      ? settings.email
      : `${settings.username} on ${new URL(settings.url).host}`;
  sync.lastSyncedAt = settings?.lastSyncedAt ?? null;
}

/** Shows Sign in again, with Google's script loading so its popup can open from the click. */
function askToSignIn() {
  sync.needsSignIn = true;
  if (settings?.service === 'drive') loadGoogle().catch(() => {});
}

/** The saved token, or a new one from the Worker once it runs out. Null: sign in again. */
async function freshToken(current: DriveSettings): Promise<string | null> {
  if (current.token.expiresAt - EXPIRY_MARGIN > Date.now()) return current.token.value;
  const token = await refreshToken();
  if (settings !== current) return null; // disconnected meanwhile
  if (!token) {
    askToSignIn();
    return null;
  }
  sync.needsSignIn = false;
  current.token = token;
  await save();
  return token.value;
}

/** Where to sync. Null: sign in again first. */
async function backendFor(current: Settings): Promise<DriveBackend | WebDavBackend | null> {
  if (current.service === 'webdav') return new WebDavBackend(current, device);
  const token = await freshToken(current);
  return token ? new DriveBackend(token, device, current.fileId) : null;
}

async function runOnce(retry = true): Promise<void> {
  const current = settings;
  if (!current) return;
  sync.syncing = true;
  try {
    const started = new Date();
    lastStart = started.getTime();
    const backend = await backendFor(current);
    if (!backend) return;
    const { cursor, dropMissing } = startFrom(current.lastSyncedAt, current.cursor, started);
    const result = await syncWith(
      backend,
      { cursor, pushedKey: current.pushedKey },
      { dropMissing, tidy: !tidied },
    );
    if (settings !== current) return; // disconnected meanwhile
    tidied = true;
    // The start, not now: a task written during the sync may not be in the file
    Object.assign(current, {
      lastSyncedAt: started.toISOString(),
      cursor: result.cursor,
      pushedKey: result.pushedKey,
    });
    if (current.service === 'drive' && backend instanceof DriveBackend) current.fileId = backend.fileId;
    sync.needsSignIn = false;
    await save();
    // Files it couldn't take in: everything else still synced
    sync.needsUpdate = result.skipped.newer > 0;
    sync.error = result.skipped.newer
      ? 'Another device synced with a newer version of Dumb Tasks. Reload to update this one.'
      : result.skipped.unreadable
        ? "Another device's sync file couldn't be read, so its changes are missing here."
        : '';
  } catch (e) {
    if (settings !== current) return;
    // Google can end a token early; one fresh token, then ask to sign in.
    if (e instanceof DriveAuthError && current.service === 'drive' && retry) {
      current.token.expiresAt = 0;
      return await runOnce(false);
    }
    if (e instanceof SignedOutError) askToSignIn();
    else sync.error = (e as Error).message;
  } finally {
    sync.syncing = false;
    show();
  }
}

/** Syncs now, or straight after the sync already running (which may have missed an edit). */
export function syncNow(): Promise<void> {
  clearTimeout(editTimer);
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await oneAtATime(async () => {
        await catchUp();
        await runOnce();
      });
    } while (again);
    running = null;
  })();
  return running;
}

/** Starts syncing with these settings, from scratch. */
async function start(next: Settings) {
  settings = next;
  tidied = false;
  sync.needsSignIn = false;
  await save();
  show();
  await syncNow();
}

/** Turns Drive sync on from a click: opens Google's sign-in popup. */
export async function connectDrive() {
  sync.error = '';
  try {
    const token = await signIn();
    const email = await fetchEmail(token.value);
    await start({ service: 'drive', email, token, fileId: null, ...NOT_SYNCED });
  } catch (e) {
    sync.error = (e as Error).message;
  }
}

/** Signs in again after Google signed this device out. From a click: it opens a popup. */
export async function reconnectDrive() {
  if (settings?.service !== 'drive') return;
  const current = settings;
  sync.error = '';
  try {
    const token = await signIn(fullSignIn ? undefined : current.email);
    const email = await fetchEmail(token.value);
    if (settings !== current) return; // disconnected meanwhile
    // Merging this device's tasks into another account should be a choice, not a slip
    if (email !== current.email) {
      signOut().catch(() => {}); // the Worker now holds the other account's sign-in
      throw new Error(`That's ${email}, not ${current.email}. To switch accounts, disconnect first.`);
    }
    current.token = token;
    fullSignIn = false;
    sync.needsSignIn = false;
    await save();
    show();
    await syncNow();
  } catch (e) {
    fullSignIn = true;
    sync.error = (e as Error).message;
  }
}

/** Turns WebDAV sync on, once a check finds the address and sign-in work. */
export async function connectWebDav(url: string, username: string, password: string) {
  sync.error = '';
  try {
    const account = { url: serverUrl(url), username: username.trim(), password };
    await new WebDavBackend(account, device).check();
    await start({ service: 'webdav', ...account, ...NOT_SYNCED });
  } catch (e) {
    sync.error = (e as Error).message;
  }
}

/**
 * Signs in again with a new password, after the server turned the saved one down. Same
 * server and user only: switching means disconnecting first, as with Drive.
 */
export async function reconnectWebDav(password: string) {
  if (settings?.service !== 'webdav') return;
  const current = settings;
  sync.error = '';
  try {
    await new WebDavBackend({ ...current, password }, device).check();
    if (settings !== current) return; // disconnected meanwhile
    current.password = password;
    sync.needsSignIn = false;
    await save();
    await syncNow();
  } catch (e) {
    sync.error = (e as Error).message;
  }
}

/** Stops syncing on this device. Tasks stay here and on the service. */
export async function disconnect() {
  const was = settings;
  settings = null;
  sync.needsSignIn = false;
  sync.needsUpdate = false;
  sync.error = '';
  show();
  await save();
  if (was?.service === 'drive') signOut().catch(() => {});
}

/** This install's id, made the first time it's needed. */
async function deviceId(): Promise<string> {
  const saved = await db.settings.get('device');
  if (saved) return saved.value;
  const id = ulid();
  await db.settings.put({ key: 'device', value: id });
  return id;
}

/** Called once at startup. */
export async function startSync() {
  device = await deviceId();
  settings = await load();
  show();

  onLocalChange(() => {
    if (!settings) return;
    clearTimeout(editTimer);
    editTimer = setTimeout(syncNow, EDIT_DELAY);
  });

  document.addEventListener('visibilitychange', () => {
    // Coming back: pull what other devices did. Leaving: push any edit still waiting.
    if (settings) syncNow();
  });
  window.addEventListener('focus', () => {
    if (settings && Date.now() - lastStart > FOCUS_GAP) syncNow();
  });
  window.addEventListener('online', () => settings && syncNow());
  setInterval(() => {
    if (settings && document.visibilityState === 'visible') syncNow();
  }, INTERVAL);

  if (settings) await syncNow();
}
