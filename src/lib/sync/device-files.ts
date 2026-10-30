// What both backends (drive.ts, webdav.ts) do the same way with the files they keep: one per
// device, named after it, and cleared out once the device is no longer used.

const PREFIX = 'device-';

/**
 * How long a request to the backend may take. One that never ends (a busy server, a dropped
 * connection) would hold up every later sync, in every tab: give up, and try again next time.
 */
export const REQUEST_TIMEOUT = 30_000;

/** This device's file. */
export const deviceFileName = (device: string) => `${PREFIX}${device}.json`;

/** Whether a file in the app's folder is a device's: other files there are left alone. */
export const isDeviceFile = (name: string) => name.startsWith(PREFIX);

/**
 * Other devices' files unchanged for longer than `maxAge` ms. Ages are measured back from
 * the newest file, by the backend's clock, so a device whose own clock is far ahead can't
 * sweep away files still in use.
 */
export function staleFiles<F extends { name: string }>(
  files: F[],
  own: string,
  maxAge: number,
  modifiedAt: (file: F) => number,
): F[] {
  const newest = Math.max(...files.map(modifiedAt));
  return files.filter((f) => f.name !== own && modifiedAt(f) < newest - maxAge);
}
