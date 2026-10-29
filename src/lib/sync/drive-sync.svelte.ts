import { ulid } from 'ulid';
import { db } from '../db';
import { DriveAuthError, DriveBackend, fetchEmail } from './drive';
import { startFrom, syncWith } from './engine';
import { CLIENT_ID, loadGoogle, refreshToken, signIn, signOut, type AccessToken } from './google-auth';
import { onLocalChange } from './local-changes';

// When and how the app syncs with Google Drive, and the state the sync menu shows.
// Syncs on open, when the app comes back into view or its window gets focus, a few seconds
// after each edit, and every minute. Never blocks the app: everything is saved locally first.
// A sync with nothing to do is a single small request.

const EDIT_DELAY = 3_000;
const INTERVAL = 60_000;
const FOCUS_GAP = 5_000; // focus often comes with coming into view, which already synced
const EXPIRY_MARGIN = 60_000; // don't start a sync with a token about to run out

// Device-only, in the settings table. The token is kept so syncs within its hour don't each
// ask the Worker for a new one; it only grants access to the app's own Drive folder.
interface DriveSettings {
  email: string;
  token: AccessToken;
  lastSyncedAt: string | null; // when the last sync that worked began
  fileId: string | null; // this device's file in Drive
  cursor: string | null; // see SyncState
  pushedKey: string | null;
}

function newSettings(email: string, token: AccessToken): DriveSettings {
  return { email, token, lastSyncedAt: null, fileId: null, cursor: null, pushedKey: null };
}

export const sync = $state({
  available: Boolean(CLIENT_ID),
  connected: false,
  email: '',
  syncing: false,
  needsSignIn: false, // Google signed this device out: a click on Sign in again fixes it
  error: '',
  lastSyncedAt: null as string | null,
});

let settings: DriveSettings | null = null;
let device = ''; // names this device's file: one per install, kept through reconnects
let tidied = false; // stale files cleared out since the app opened
let lastStart = 0;
let running: Promise<void> | null = null;
let again = false;
let editTimer: ReturnType<typeof setTimeout> | undefined;
// A quiet sign-in failed (e.g. signed out of Google in this browser): the next try shows
// Google's full sign-in. It can't follow straight on, as the popup needs a fresh click.
let fullSignIn = false;

async function save() {
  if (settings) await db.settings.put({ key: 'drive', value: JSON.stringify(settings) });
  else await db.settings.delete('drive');
}

function show() {
  sync.connected = Boolean(settings);
  sync.email = settings?.email ?? '';
  sync.lastSyncedAt = settings?.lastSyncedAt ?? null;
}

/** Shows Sign in again, with Google's script loading so its popup can open from the click. */
function askToSignIn() {
  sync.needsSignIn = true;
  loadGoogle().catch(() => {});
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

async function runOnce(retry = true): Promise<void> {
  const current = settings;
  if (!current) return;
  sync.syncing = true;
  try {
    const started = new Date();
    lastStart = started.getTime();
    const token = await freshToken(current);
    if (!token) return;
    const { cursor, dropMissing } = startFrom(current.lastSyncedAt, current.cursor, started);
    const backend = new DriveBackend(token, device, current.fileId);
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
      fileId: backend.fileId,
      cursor: result.cursor,
      pushedKey: result.pushedKey,
    });
    await save();
    sync.error = '';
  } catch (e) {
    if (settings !== current) return;
    // Google can end a token early; one fresh token, then ask to sign in.
    if (e instanceof DriveAuthError && retry) {
      current.token.expiresAt = 0;
      return await runOnce(false);
    }
    if (e instanceof DriveAuthError) askToSignIn();
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
      await runOnce();
    } while (again);
    running = null;
  })();
  return running;
}

/** Turns sync on from a click: opens Google's sign-in popup. */
export async function connect() {
  sync.error = '';
  try {
    const token = await signIn();
    settings = newSettings(await fetchEmail(token.value), token);
    tidied = false;
    await save();
    show();
    await syncNow();
  } catch (e) {
    sync.error = (e as Error).message;
  }
}

/** Signs in again after Google signed this device out. From a click: it opens a popup. */
export async function reconnect() {
  if (!settings) return;
  sync.error = '';
  try {
    const token = await signIn(fullSignIn ? undefined : settings.email);
    if (!settings) return; // disconnected meanwhile
    // The full sign-in may have picked another account: sync it as if newly connected
    const email = fullSignIn ? await fetchEmail(token.value) : settings.email;
    if (!settings) return;
    if (email !== settings.email) {
      settings = newSettings(email, token);
      tidied = false;
    } else settings.token = token;
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

/** Stops syncing on this device. Tasks stay here and in Drive. */
export async function disconnect() {
  settings = null;
  sync.needsSignIn = false;
  sync.error = '';
  show();
  await save();
  signOut().catch(() => {});
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
  if (!CLIENT_ID) return;
  device = await deviceId();
  const saved = await db.settings.get('drive');
  // Older versions saved fewer fields
  settings = saved ? { fileId: null, cursor: null, pushedKey: null, ...JSON.parse(saved.value) } : null;
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
