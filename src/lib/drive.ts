import type { SyncBackend } from './sync';

// The data file lives in the app's hidden folder in the user's Google Drive.

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const NAME = 'dumb-tasks.json';

/** The token has expired or been revoked: the user needs to sign in again. */
export class DriveAuthError extends Error {
  constructor() {
    super('Signed out of Google Drive.');
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
  if (!res.ok) throw new Error(`Google Drive replied ${res.status}.`);
  return res;
}

/** The signed-in account's email, shown in the sync menu and used to sign in again quietly. */
export async function fetchEmail(token: string): Promise<string> {
  const res = await call(token, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
  return (await res.json()).user.emailAddress;
}

export class DriveBackend implements SyncBackend {
  constructor(private token: string) {}

  /**
   * Looks the file up by name each time rather than remembering its id, so a file removed
   * from Drive is simply made again. If two devices ever both create one, the oldest wins;
   * the other device's tasks get merged into it on its next sync.
   */
  private async find(): Promise<{ id: string; version: string } | null> {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name = '${NAME}' and trashed = false`,
      orderBy: 'createdTime',
      fields: 'files(id,version)',
    });
    const res = await call(this.token, `${FILES}?${params}`);
    const file = (await res.json()).files[0];
    // Drive bumps `version` on every change to the file.
    return file ? { id: file.id, version: `${file.id}@${file.version}` } : null;
  }

  async load() {
    const file = await this.find();
    if (!file) return null;
    const res = await call(this.token, `${FILES}/${file.id}?alt=media`, { cache: 'no-store' });
    return { json: await res.text(), version: file.version };
  }

  // Drive has no conditional writes, so this checks the version just before writing. Another
  // device could still slip in between; merging makes that harmless (see sync.ts).
  async save(json: string, version: string | null) {
    const file = await this.find();
    if ((file?.version ?? null) !== version) return false;

    const body = new Blob([json], { type: 'application/json' });
    if (file) {
      await call(this.token, `${UPLOAD}/${file.id}?uploadType=media`, {
        method: 'PATCH',
        body,
      });
    } else {
      const form = new FormData();
      const metadata = { name: NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', body);
      await call(this.token, `${UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', body: form });
    }
    return true;
  }
}
