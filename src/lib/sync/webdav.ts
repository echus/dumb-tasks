import { SignedOutError, type RemoteFile, type SyncBackend } from './engine';

// Each device's data file lives in a dumb-tasks folder on the user's own WebDAV server (e.g.
// Nextcloud, or Apache's mod_dav), which the browser talks to directly. So the server has to
// allow the app's origin (CORS): see the README for setup.

const FOLDER = 'dumb-tasks/';
const PREFIX = 'device-';

/** Where to sync, as the user entered it. The password is best an app password. */
export interface WebDavAccount {
  url: string; // the WebDAV folder the app's folder goes in, ending in /
  username: string;
  password: string;
}

/** The server turned down the username or password: the user needs to enter them again. */
export class WebDavAuthError extends SignedOutError {
  constructor() {
    super('The WebDAV server did not accept the username or password.');
  }
}

/**
 * The server couldn't be reached at all: offline, or the request was cut off. Or the server
 * doesn't allow the app's origin, which the browser reports the same way.
 */
export class WebDavUnreachableError extends Error {
  constructor() {
    super('Cannot connect to the WebDAV server. The app will try again.');
  }
}

class StatusError extends Error {
  constructor(public status: number) {
    super(`The WebDAV server sent error ${status}.`);
  }
}

/** Not there, or its folder isn't (servers differ on which they say). */
const isMissing = (e: unknown) => e instanceof StatusError && (e.status === 404 || e.status === 409);

/**
 * The address as typed, tidied up, or an error to show if it can't work. Plain http only
 * to this computer, or when the app itself is on http: browsers block it from an https page.
 */
export function serverUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Enter the full address. It must start with https://.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const plainOk = local || location.protocol === 'http:';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && plainOk)) {
    throw new Error('The address must start with https://.');
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  url.search = '';
  url.hash = '';
  return url.href;
}

/** Basic auth, UTF-8 encoded: btoa alone can't take characters past Latin-1. */
function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

const PROPFIND = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getlastmodified/></d:prop></d:propfind>`;

interface Entry {
  name: string;
  version: string; // changes whenever the file does
  modifiedAt: number; // ms, by the server's clock
}

/** The files in a PROPFIND reply. Servers differ in namespace prefixes and href forms. */
function parseListing(xml: string): Entry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entries: Entry[] = [];
  for (const response of doc.getElementsByTagNameNS('DAV:', 'response')) {
    const prop = (name: string) =>
      response.getElementsByTagNameNS('DAV:', name)[0]?.textContent?.trim() || null;
    const href = prop('href') ?? '';
    if (href.endsWith('/')) continue; // the folder itself, or one inside it
    const modified = prop('getlastmodified');
    entries.push({
      name: decodeURIComponent(href.slice(href.lastIndexOf('/') + 1)),
      // A few servers give no ETag; the time still changes with each write
      version: prop('getetag') ?? modified ?? '',
      modifiedAt: modified ? Date.parse(modified) : 0,
    });
  }
  return entries;
}

export class WebDavBackend implements SyncBackend {
  private root: string;
  private folder: string;
  private name: string;
  private auth: string;

  constructor(account: WebDavAccount, device: string) {
    this.root = account.url;
    this.folder = new URL(FOLDER, account.url).href;
    this.name = `${PREFIX}${device}.json`;
    this.auth = basicAuth(account.username, account.password);
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, {
      ...init,
      cache: 'no-store',
      headers: { ...init.headers, Authorization: this.auth },
    }).catch(() => {
      throw new WebDavUnreachableError();
    });
    if (res.status === 401) throw new WebDavAuthError();
    if (!res.ok) throw new StatusError(res.status);
    return res;
  }

  private propfind(url: string, depth: '0' | '1'): Promise<Response> {
    return this.call(url, {
      method: 'PROPFIND',
      headers: { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' },
      body: PROPFIND,
    });
  }

  /**
   * Checks the address and sign-in work, before they're saved. The errors say what to fix.
   */
  async check(): Promise<void> {
    try {
      await this.propfind(this.root, '0');
    } catch (e) {
      if (e instanceof WebDavUnreachableError) {
        throw new Error(
          'Cannot connect to the server. Make sure that the address is correct and the server allows this app (CORS).',
        );
      }
      if (e instanceof StatusError) {
        throw new Error(
          e.status === 404 ? 'There is no folder at this address.' : 'This address is not a WebDAV folder.',
        );
      }
      throw e;
    }
  }

  /** Every device's data file, this one's included. */
  private async list(): Promise<Entry[]> {
    try {
      const res = await this.propfind(this.folder, '1');
      return parseListing(await res.text()).filter((f) => f.name.startsWith(PREFIX));
    } catch (e) {
      if (isMissing(e)) return []; // no device has synced yet
      throw e;
    }
  }

  private async download(file: Entry): Promise<RemoteFile | null> {
    try {
      const res = await this.call(this.folder + file.name);
      return { json: await res.text(), modifiedAt: file.modifiedAt };
    } catch (e) {
      if (isMissing(e)) return null; // removed since it was listed
      throw e;
    }
  }

  // The cursor is each other file's version as last read: a listing says which changed.
  // A file written between the listing and its download is read again next time, which is
  // harmless.
  async pull(cursor: string | null) {
    const seen: Record<string, string> = cursor ? JSON.parse(cursor) : {};
    const others = (await this.list()).filter((f) => f.name !== this.name);
    const changed = others.filter((f) => seen[f.name] !== f.version);
    const files = await Promise.all(changed.map((f) => this.download(f)));
    const next = Object.fromEntries(others.map((f) => [f.name, f.version]));
    return { files: files.filter((f) => f !== null), cursor: JSON.stringify(next) };
  }

  async push(json: string) {
    const put = () =>
      this.call(this.folder + this.name, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      });
    try {
      await put();
    } catch (e) {
      if (!isMissing(e)) throw e;
      // 405: another device made the folder meanwhile
      await this.call(this.folder, { method: 'MKCOL' }).catch((e) => {
        if (!(e instanceof StatusError && e.status === 405)) throw e;
      });
      await put();
    }
  }

  // Ages are measured back from the newest file, by the server's clock, so a device whose
  // own clock is far ahead can't sweep away files still in use.
  async removeStale(maxAge: number) {
    const files = await this.list();
    const newest = Math.max(...files.map((f) => f.modifiedAt));
    const stale = files.filter((f) => f.name !== this.name && f.modifiedAt < newest - maxAge);
    await Promise.all(
      stale.map((f) =>
        this.call(this.folder + f.name, { method: 'DELETE' }).catch((e) => {
          if (!isMissing(e)) throw e;
        }),
      ),
    );
    return { hasOwnFile: files.some((f) => f.name === this.name) };
  }
}
