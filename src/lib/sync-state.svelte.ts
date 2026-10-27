import { db } from './db';
import { DriveAuthError, DriveBackend, fetchEmail } from './drive';
import { CLIENT_ID, loadGoogle, requestToken, revokeToken, type AccessToken } from './google-auth';
import { onLocalChange, syncWith } from './sync';

// When and how the app syncs with Google Drive, and the state the sync menu shows.
// Syncs on open, when the app comes back into view, a few seconds after each edit, and
// every few minutes. Never blocks the app: everything is saved locally first.

const EDIT_DELAY = 3_000;
const INTERVAL = 5 * 60_000;
const EXPIRY_MARGIN = 60_000; // don't start a sync with a token about to run out

// Device-only, in the settings table. The token is kept so reopening the app within the
// hour doesn't need another sign-in; it only grants access to the app's own Drive folder.
interface DriveSettings {
  email: string;
  token: AccessToken;
  lastSyncedAt: string | null;
}

export const sync = $state({
  available: Boolean(CLIENT_ID),
  connected: false,
  email: '',
  syncing: false,
  needsSignIn: false, // the token expired: a click on Reconnect gets a new one
  error: '',
  lastSyncedAt: null as string | null,
});

let settings: DriveSettings | null = null;
let running: Promise<void> | null = null;
let again = false;
let editTimer: ReturnType<typeof setTimeout> | undefined;

async function save() {
  if (settings) await db.settings.put({ key: 'drive', value: JSON.stringify(settings) });
  else await db.settings.delete('drive');
}

function show() {
  sync.connected = Boolean(settings);
  sync.email = settings?.email ?? '';
  sync.lastSyncedAt = settings?.lastSyncedAt ?? null;
}

async function runOnce() {
  if (!settings) return;
  if (settings.token.expiresAt - EXPIRY_MARGIN < Date.now()) {
    sync.needsSignIn = true;
    return;
  }
  sync.syncing = true;
  try {
    await syncWith(new DriveBackend(settings.token.value));
    settings.lastSyncedAt = new Date().toISOString();
    await save();
    sync.error = '';
  } catch (e) {
    if (e instanceof DriveAuthError) sync.needsSignIn = true;
    else if (e instanceof TypeError) sync.error = "Couldn't reach Google Drive. Will try again.";
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
    const token = await requestToken();
    settings = { email: await fetchEmail(token.value), token, lastSyncedAt: null };
    await save();
    show();
    await syncNow();
  } catch (e) {
    sync.error = (e as Error).message;
  }
}

/** Gets a fresh token after the old one expired. From a click: it opens a popup. */
export async function reconnect() {
  if (!settings) return;
  sync.error = '';
  try {
    settings.token = await requestToken(settings.email);
    sync.needsSignIn = false;
    await save();
    await syncNow();
  } catch (e) {
    sync.error = (e as Error).message;
  }
}

/** Stops syncing on this device. Tasks stay here and in Drive. */
export async function disconnect() {
  const token = settings?.token.value;
  settings = null;
  sync.needsSignIn = false;
  sync.error = '';
  show();
  await save();
  if (token) revokeToken(token).catch(() => {});
}

/** Called once at startup. */
export async function startSync() {
  if (!CLIENT_ID) return;
  const saved = await db.settings.get('drive');
  settings = saved ? JSON.parse(saved.value) : null;
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
  window.addEventListener('online', () => settings && syncNow());
  setInterval(() => {
    if (settings && document.visibilityState === 'visible') syncNow();
  }, INTERVAL);

  if (settings) {
    loadGoogle().catch(() => {}); // ready for a quick Reconnect
    await syncNow();
  }
}
