import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveAuthError, DriveBackend, DriveUnreachableError } from './drive';

const DAY = 86_400_000;
const T = Date.parse('2026-10-29T12:00:00Z');
const at = (daysAgo: number) => new Date(T - daysAgo * DAY).toISOString();

/**
 * Just enough of Drive's REST API, for the calls DriveBackend makes, in memory: the app
 * folder's files and its change log. Change pages are kept small so tests reach paging.
 */
class FakeDrive {
  files = new Map<string, { name: string; content: string; modifiedTime: string }>();
  log: string[] = []; // file ids, in the order they changed; a page token is an index here
  calls: string[] = [];
  pageSize = 2;
  nextId = 1;
  failWith: number | 'offline' | null = null;

  add(name: string, content: string, modifiedTime = at(0)): string {
    const id = `id${this.nextId++}`;
    this.files.set(id, { name, content, modifiedTime });
    this.log.push(id);
    return id;
  }

  remove(id: string) {
    this.files.delete(id);
    this.log.push(id);
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${url.pathname.replace(/^\/(upload\/)?drive\/v3/, '')}`);
    if (this.failWith === 'offline') throw new TypeError('Failed to fetch');
    if (this.failWith) return new Response(null, { status: this.failWith });
    const id = url.pathname.match(/\/files\/([^/]+)$/)?.[1];
    const json = (body: unknown) => Response.json(body);
    const missing = new Response(null, { status: 404 });

    if (url.pathname.endsWith('/changes/startPageToken')) {
      return json({ startPageToken: String(this.log.length) });
    }
    if (url.pathname.endsWith('/changes')) {
      const from = Number(url.searchParams.get('pageToken'));
      const page = this.log.slice(from, from + this.pageSize);
      const changes = page.map((fileId) => {
        const file = this.files.get(fileId);
        if (!file) return { fileId, removed: true };
        return { fileId, removed: false, file: { ...file, trashed: false } };
      });
      const end = from + page.length;
      return json(
        end < this.log.length
          ? { changes, nextPageToken: String(end) }
          : { changes, newStartPageToken: String(end) },
      );
    }
    if (method === 'GET' && url.pathname.endsWith('/files')) {
      const files = [...this.files].map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime }));
      return json({ files });
    }
    if (method === 'GET' && id) {
      const file = this.files.get(id);
      return file ? new Response(file.content) : missing;
    }
    if (method === 'PATCH' && id) {
      const file = this.files.get(id);
      if (!file) return missing;
      file.content = await (init.body as Blob).text();
      file.modifiedTime = at(0);
      this.log.push(id);
      return json({ id });
    }
    if (method === 'POST') {
      const form = init.body as FormData;
      const metadata = JSON.parse(await (form.get('metadata') as Blob).text());
      expect(metadata.parents).toEqual(['appDataFolder']);
      return json({ id: this.add(metadata.name, await (form.get('file') as Blob).text()) });
    }
    if (method === 'DELETE' && id) {
      if (!this.files.has(id)) return missing;
      this.remove(id);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };

  contents(name: string): string | undefined {
    return [...this.files.values()].find((f) => f.name === name)?.content;
  }

  names(): string[] {
    return [...this.files.values()].map((f) => f.name).sort();
  }
}

let drive: FakeDrive;
const backend = (fileId: string | null = null) => new DriveBackend('token', 'here', fileId);
const jsons = (files: { json: string }[]) => files.map((f) => f.json).sort();

beforeEach(() => {
  drive = new FakeDrive();
  vi.stubGlobal('fetch', drive.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DriveBackend', () => {
  describe('pull', () => {
    it("reads every other device's file, and nothing else, on a first pull", async () => {
      drive.add('device-phone.json', 'phone', at(3));
      drive.add('device-tablet.json', 'tablet');
      drive.add('device-here.json', 'mine');
      drive.add('dumb-tasks.json', 'old shared file');
      drive.add('notes.txt', 'something else');

      const { files } = await backend().pull(null);
      expect(jsons(files)).toEqual(['phone', 'tablet']);
      expect(files.find((f) => f.json === 'phone')!.modifiedAt).toBe(Date.parse(at(3)));
    });

    it('takes the cursor before listing, so a file written meanwhile shows up next time', async () => {
      drive.add('device-phone.json', 'phone');
      const { cursor } = await backend().pull(null);
      expect(drive.calls[0]).toBe('GET /changes/startPageToken');

      drive.add('device-tablet.json', 'tablet');
      expect(jsons((await backend().pull(cursor)).files)).toEqual(['tablet']);
    });

    it('then reads only the files changed since, across pages of changes', async () => {
      const phone = drive.add('device-phone.json', 'phone');
      drive.add('device-tablet.json', 'tablet');
      const { cursor } = await backend().pull(null);

      drive.add('device-laptop.json', 'laptop');
      drive.add('device-here.json', 'mine');
      drive.add('dumb-tasks.json', 'old shared file');
      drive.files.get(phone)!.content = 'phone, edited';
      drive.log.push(phone);
      const later = await backend().pull(cursor);
      expect(jsons(later.files)).toEqual(['laptop', 'phone, edited']);

      expect((await backend().pull(later.cursor)).files).toEqual([]);
    });

    it('skips files removed since they changed', async () => {
      const { cursor } = await backend().pull(null);
      const phone = drive.add('device-phone.json', 'phone');
      drive.remove(phone);
      expect((await backend().pull(cursor)).files).toEqual([]);
    });
  });

  describe('push', () => {
    it("makes this device's file the first time", async () => {
      const b = backend();
      await b.push('mine');
      expect(drive.contents('device-here.json')).toBe('mine');
      expect(b.fileId).toBe('id1');
    });

    it('finds the file by name when its id is unknown, rather than making another', async () => {
      const id = drive.add('device-here.json', 'old');
      const b = backend();
      await b.push('new');
      expect(drive.names()).toEqual(['device-here.json']);
      expect(drive.contents('device-here.json')).toBe('new');
      expect(b.fileId).toBe(id);
    });

    it('writes straight to a known file', async () => {
      const id = drive.add('device-here.json', 'old');
      await backend(id).push('new');
      expect(drive.contents('device-here.json')).toBe('new');
      expect(drive.calls).toEqual([`PATCH /files/${id}`]);
    });

    it('makes the file again if it was removed', async () => {
      const id = drive.add('device-here.json', 'old');
      drive.remove(id);
      const b = backend(id);
      await b.push('new');
      expect(drive.contents('device-here.json')).toBe('new');
      expect(b.fileId).not.toBe(id);
    });
  });

  describe('removeStale', () => {
    const MAX_AGE = 90 * DAY;

    it("deletes other devices' files unchanged for longer than maxAge", async () => {
      drive.add('device-here.json', 'mine', at(0));
      drive.add('device-phone.json', 'phone', at(89));
      drive.add('device-drawer.json', 'drawer', at(91));
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: true });
      expect(drive.names()).toEqual(['device-here.json', 'device-phone.json']);
    });

    it('measures age back from the newest file, not this device clock', async () => {
      // Every file is old by the real date, but they were in use together
      drive.add('device-here.json', 'mine', at(400));
      drive.add('device-phone.json', 'phone', at(380));
      await backend().removeStale(MAX_AGE);
      expect(drive.names()).toEqual(['device-here.json', 'device-phone.json']);
    });

    it("never deletes this device's own file, and says when it's missing", async () => {
      drive.add('device-here.json', 'mine', at(200));
      drive.add('device-phone.json', 'phone', at(0));
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: true });
      expect(drive.names()).toContain('device-here.json');

      drive.files.clear();
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: false });
    });

    it('deletes the old shared file however recent, and leaves other files alone', async () => {
      drive.add('device-here.json', 'mine', at(0));
      drive.add('dumb-tasks.json', 'old shared file', at(0));
      drive.add('notes.txt', 'something else', at(300));
      await backend().removeStale(MAX_AGE);
      expect(drive.names()).toEqual(['device-here.json', 'notes.txt']);
    });
  });

  describe('errors', () => {
    it('reports a revoked or expired token', async () => {
      drive.failWith = 401;
      await expect(backend().pull(null)).rejects.toBeInstanceOf(DriveAuthError);
    });

    it('reports being offline', async () => {
      drive.failWith = 'offline';
      await expect(backend().push('mine')).rejects.toBeInstanceOf(DriveUnreachableError);
    });

    it('reports any other failure with its status', async () => {
      drive.failWith = 500;
      await expect(backend().pull(null)).rejects.toThrow('Google Drive replied 500.');
    });
  });
});
