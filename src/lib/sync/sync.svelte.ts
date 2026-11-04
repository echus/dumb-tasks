import { DRIVE_AVAILABLE } from '../config';
import { DriveAuthError, DriveBackend, fetchEmail } from './drive';
import { SignedOutError, startFrom, syncWith } from './engine';
import { loadGoogle, refreshToken, signIn, signOut } from './google-auth';
import { onLocalChange } from './local-changes';
import {
  deviceId,
  identity,
  loadSettings,
  NOT_SYNCED,
  saveSettings,
  type DriveSettings,
  type Settings,
} from './settings';
import { serverUrl, WebDavBackend } from './webdav';

// When and how the app syncs, with Google Drive or a WebDAV server, and the state the sync
// menu shows. Syncs on open, when the app comes back into view or its window gets focus, a
// few seconds after each edit, and every minute. Never blocks the app: everything is saved
// locally first. A sync with nothing to do is a single small request.

const EDIT_DELAY = 3_000;
const INTERVAL = 60_000;
const FOCUS_GAP = 5_000; // focus often comes with coming into view, which already synced
const EXPIRY_MARGIN = 60_000; // don't start a sync with a token about to run out

export const sync = $state({
  driveAvailable: DRIVE_AVAILABLE,
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
// The WebDAV password the server last turned down: not sent again, as servers can lock out
// an address after repeated failed sign-ins. A new one, here or from another tab, is tried.
let rejectedPassword: string | null = null;
let lastStart = 0;
let running: Promise<void> | null = null;
let again = false;
let editTimer: ReturnType<typeof setTimeout> | undefined;
// A quiet sign-in failed (e.g. signed out of Google in this browser): the next try shows
// Google's full sign-in. It can't follow straight on, as the popup needs a fresh click.
let fullSignIn = false;

/** Takes in what another tab of the app saved: a sync, a new token, a disconnect. */
async function catchUp() {
  const saved = await loadSettings();
  if (saved && settings && identity(saved) === identity(settings)) Object.assign(settings, saved);
  else {
    // Disconnected or switched: what this tab showed was about the old connection
    settings = saved;
    tidied = false;
    rejectedPassword = null;
    sync.needsSignIn = false;
    sync.needsUpdate = false;
    sync.error = '';
    show();
  }
}

/** One sync at a time across this device's open tabs, as they share its file and settings. */
function oneAtATime(fn: () => Promise<void>): Promise<void> {
  // Named before WebDAV; kept so tabs still on an older version take turns with this one
  return navigator.locks ? navigator.locks.request('drive-sync', fn) : fn();
}

/**
 * Saves the settings from a click, after any sync running in another tab: else that sync,
 * finishing late, could put back the connection this click replaced. Not around syncNow,
 * which takes its own turn (locks don't nest).
 */
function saveInTurn(): Promise<void> {
  return oneAtATime(() => saveSettings(settings));
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
  // The Worker's sign-in should be this account's, but check before syncing with it
  const email = await fetchEmail(token.value);
  if (settings !== current) return null;
  if (email !== current.email) {
    signOut().catch(() => {});
    askToSignIn();
    return null;
  }
  sync.needsSignIn = false;
  current.token = token;
  await saveSettings(settings);
  return token.value;
}

/** Where to sync. Null: sign in again first. */
async function backendFor(current: Settings): Promise<DriveBackend | WebDavBackend | null> {
  if (current.service === 'webdav') {
    return current.password === rejectedPassword ? null : new WebDavBackend(current, device);
  }
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
    await saveSettings(settings);
    // Files it couldn't take in: everything else still synced
    sync.needsUpdate = result.skipped.newer > 0;
    sync.error = result.skipped.newer
      ? 'Another device synced with a newer version of Dumb Tasks. Reload the app to update it.'
      : result.skipped.unreadable
        ? 'The app cannot read the sync file of another device. Changes from that device are not here.'
        : '';
  } catch (e) {
    if (settings !== current) return;
    // Google can end a token early; one fresh token, then ask to sign in.
    if (e instanceof DriveAuthError && current.service === 'drive' && retry) {
      current.token.expiresAt = 0;
      return await runOnce(false);
    }
    if (e instanceof SignedOutError) {
      if (current.service === 'webdav') rejectedPassword = current.password;
      askToSignIn();
    } else sync.error = (e as Error).message;
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
  rejectedPassword = null;
  sync.needsSignIn = false;
  await saveInTurn();
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
      throw new Error(`This is ${email}, not ${current.email}. To use a different account, disconnect first.`);
    }
    current.token = token;
    fullSignIn = false;
    sync.needsSignIn = false;
    await saveInTurn();
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
    await saveInTurn();
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
  await saveInTurn();
  if (was?.service === 'drive') signOut().catch(() => {});
}

/** Called once at startup. */
export async function startSync() {
  device = await deviceId();
  settings = await loadSettings();
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
