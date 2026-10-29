import { SignedOutError, type RemoteFile, type SyncBackend } from './engine';

// Each device's data file lives in the app's hidden folder in the user's Google Drive.

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const PREFIX = 'device-';
// The one file every device shared before each had its own. Ignored, and deleted with the
// stale files: a device still on that version recreates it until it updates.
const LEGACY = 'dumb-tasks.json';

const isDataFile = (name: string) => name.startsWith(PREFIX);

/** The token has expired or been revoked: the user needs to sign in again. */
export class DriveAuthError extends SignedOutError {
  constructor() {
    super('Signed out of Google Drive.');
  }
}

/** The file asked for isn't there (any more). */
class DriveNotFoundError extends Error {
  constructor() {
    super('Google Drive file not found.');
  }
}

/** Drive couldn't be reached at all (offline, or the request was cut off): try again later. */
export class DriveUnreachableError extends Error {
  constructor() {
    super("Couldn't reach Google Drive. Will try again.");
  }
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  }).catch(() => {
    throw new DriveUnreachableError();
  });
  if (res.status === 401) throw new DriveAuthError();
  if (res.status === 404) throw new DriveNotFoundError();
  if (!res.ok) throw new Error(`Google Drive replied ${res.status}.`);
  return res;
}

/** The signed-in account's email, shown in the sync menu and used to sign in again quietly. */
export async function fetchEmail(token: string): Promise<string> {
  const res = await call(token, `${API}/about?fields=user(emailAddress)`);
  return (await res.json()).user.emailAddress;
}

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export class DriveBackend implements SyncBackend {
  private name: string;

  /** `fileId`: this device's file, if known. Read it back after a sync, as push may make one. */
  constructor(
    private token: string,
    device: string,
    public fileId: string | null,
  ) {
    this.name = `${PREFIX}${device}.json`;
  }

  private async get<T>(url: string): Promise<T> {
    return (await call(this.token, url)).json();
  }

  /** Every file in the app's folder. */
  private async list(): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: 'trashed = false',
      fields: 'files(id,name,modifiedTime)',
      pageSize: '1000',
    });
    const { files } = await this.get<{ files: DriveFile[] }>(`${API}/files?${params}`);
    return files;
  }

  /** Every device's data file, this one's included. */
  private async listData(): Promise<DriveFile[]> {
    return (await this.list()).filter((f) => isDataFile(f.name));
  }

  /** Other devices' files changed since `cursor`, and the cursor after them. */
  private async changedSince(cursor: string): Promise<{ changed: DriveFile[]; cursor: string }> {
    const changed = new Map<string, DriveFile>();
    let page = cursor;
    for (;;) {
      const params = new URLSearchParams({
        pageToken: page,
        spaces: 'appDataFolder',
        fields:
          'nextPageToken,newStartPageToken,changes(fileId,removed,file(name,trashed,modifiedTime))',
        pageSize: '1000',
      });
      const res = await this.get<{
        changes: { fileId: string; removed: boolean; file?: DriveFile & { trashed: boolean } }[];
        nextPageToken?: string;
        newStartPageToken?: string;
      }>(`${API}/changes?${params}`);
      for (const { fileId, removed, file } of res.changes) {
        if (!removed && file && !file.trashed && isDataFile(file.name) && file.name !== this.name) {
          changed.set(fileId, { ...file, id: fileId });
        }
      }
      if (res.newStartPageToken) {
        return { changed: [...changed.values()], cursor: res.newStartPageToken };
      }
      page = res.nextPageToken!;
    }
  }

  /** The files' contents, skipping any removed since they were listed. */
  private async download(files: DriveFile[]): Promise<RemoteFile[]> {
    const texts = await Promise.all(
      files.map(async ({ id, modifiedTime }) => {
        try {
          const res = await call(this.token, `${API}/files/${id}?alt=media`, { cache: 'no-store' });
          return { json: await res.text(), modifiedAt: Date.parse(modifiedTime) };
        } catch (e) {
          if (e instanceof DriveNotFoundError) return null;
          throw e;
        }
      }),
    );
    return texts.filter((t) => t !== null);
  }

  async pull(cursor: string | null) {
    if (cursor) {
      const { changed, cursor: next } = await this.changedSince(cursor);
      return { files: await this.download(changed), cursor: next };
    }
    // The cursor first, so a file written while these download shows up next time
    const { startPageToken } = await this.get<{ startPageToken: string }>(
      `${API}/changes/startPageToken?fields=startPageToken`,
    );
    const others = (await this.listData()).filter((f) => f.name !== this.name);
    return { files: await this.download(others), cursor: startPageToken };
  }

  async push(json: string) {
    const body = new Blob([json], { type: 'application/json' });
    this.fileId ??= (await this.listData()).find((f) => f.name === this.name)?.id ?? null;
    if (this.fileId) {
      try {
        await call(this.token, `${UPLOAD}/${this.fileId}?uploadType=media&fields=id`, {
          method: 'PATCH',
          body,
        });
        return;
      } catch (e) {
        if (!(e instanceof DriveNotFoundError)) throw e;
      }
    }
    const form = new FormData();
    const metadata = { name: this.name, parents: ['appDataFolder'], mimeType: 'application/json' };
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', body);
    const res = await call(this.token, `${UPLOAD}?uploadType=multipart&fields=id`, {
      method: 'POST',
      body: form,
    });
    this.fileId = (await res.json()).id;
  }

  // Ages are measured back from the newest file, by Drive's clock, so a device whose own
  // clock is far ahead can't sweep away files still in use.
  async removeStale(maxAge: number) {
    const all = await this.list();
    const files = all.filter((f) => isDataFile(f.name));
    const newest = Math.max(...files.map((f) => Date.parse(f.modifiedTime)));
    const stale = [
      ...files.filter((f) => f.name !== this.name && Date.parse(f.modifiedTime) < newest - maxAge),
      ...all.filter((f) => f.name === LEGACY),
    ];
    await Promise.all(
      stale.map((f) =>
        call(this.token, `${API}/files/${f.id}`, { method: 'DELETE' }).catch((e) => {
          if (!(e instanceof DriveNotFoundError)) throw e;
        }),
      ),
    );
    return { hasOwnFile: files.some((f) => f.name === this.name) };
  }
}
