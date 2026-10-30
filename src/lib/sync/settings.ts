import { ulid } from 'ulid';
import { DRIVE_AVAILABLE } from '../config';
import { db } from '../db';
import type { AccessToken } from './google-auth';
import type { WebDavAccount } from './webdav';

// What this device keeps about syncing, in the settings table, which is never synced or
// exported: the service it syncs with (one at a time, saved under the service's name), how
// far it got, and this install's id, which names its file.

interface Progress {
  lastSyncedAt: string | null; // when the last sync that worked began
  cursor: string | null; // see SyncState
  pushedKey: string | null;
}

// The token is kept so syncs within its hour don't each ask the Worker for a new one; it
// only grants access to the app's own Drive folder.
export interface DriveSettings extends Progress {
  service: 'drive';
  email: string;
  token: AccessToken;
  fileId: string | null; // this device's file in Drive
}

// The password is kept as entered, like the Drive token. Best an app password, which can be
// revoked on its own.
export interface WebDavSettings extends Progress, WebDavAccount {
  service: 'webdav';
}

export type Settings = DriveSettings | WebDavSettings;

/** A new connection's progress: nothing synced yet. */
export const NOT_SYNCED: Progress = { lastSyncedAt: null, cursor: null, pushedKey: null };

/** Who and where, to tell a sign-in to the same account from one to another. */
export function identity(s: Settings): string {
  return s.service === 'drive' ? `drive ${s.email}` : `webdav ${s.username} ${s.url}`;
}

export async function loadSettings(): Promise<Settings | null> {
  const [drive, webdav] = await db.settings.bulkGet(['drive', 'webdav']);
  if (webdav) return { service: 'webdav', ...JSON.parse(webdav.value) };
  // A build without Drive (self-hosted) can't sync with it or show its Disconnect button, so
  // it ignores the Drive row. A WebDAV connect replaces it. Older versions saved fewer fields
  if (drive && DRIVE_AVAILABLE) {
    return { service: 'drive', fileId: null, cursor: null, pushedKey: null, ...JSON.parse(drive.value) };
  }
  return null;
}

/**
 * Saves the settings in place of any other service's, or none for a disconnect. Only in this
 * device's turn to sync (see oneAtATime), as its open tabs share the settings.
 */
export async function saveSettings(settings: Settings | null) {
  await db.transaction('rw', db.settings, async () => {
    await db.settings.bulkDelete(['drive', 'webdav']);
    if (settings) await db.settings.put({ key: settings.service, value: JSON.stringify(settings) });
  });
}

/** This install's id, made the first time it's needed. */
export async function deviceId(): Promise<string> {
  const saved = await db.settings.get('device');
  if (saved) return saved.value;
  const id = ulid();
  await db.settings.put({ key: 'device', value: id });
  return id;
}
