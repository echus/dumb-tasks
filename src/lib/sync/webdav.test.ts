// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://dumbtasks.app/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serverUrl, WebDavAuthError, WebDavBackend, WebDavUnreachableError } from './webdav';

const DAY = 86_400_000;
const T = Date.parse('2026-10-29T12:00:00Z');
const at = (daysAgo: number) => new Date(T - daysAgo * DAY).toUTCString();

const ROOT = 'https://cloud.example.com/remote.php/dav/files/me/';
const FOLDER = '/remote.php/dav/files/me/dumb-tasks/';

/**
 * Just enough of a WebDAV server, for the calls WebDavBackend makes, in memory: the app's
 * folder and its files. Replies vary the way real servers do: namespace prefixes, full or
 * path-only hrefs, ETags or none.
 */
class FakeDav {
  folder = false; // whether the app's folder exists
  files = new Map<string, { content: string; modified: string; etag: number }>();
  calls: string[] = [];
  nextEtag = 1;
  prefix = 'd';
  fullHrefs = false;
  etags = true;
  failWith: number | 'offline' | null = null;

  add(name: string, content: string, modified = at(0)) {
    this.folder = true;
    this.files.set(name, { content, modified, etag: this.nextEtag++ });
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${url.pathname.replace(FOLDER, '')}`);
    if (this.failWith === 'offline') throw new TypeError('Failed to fetch');
    if (this.failWith) return new Response(null, { status: this.failWith });
    expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${btoa('me:secret')}`);
    const status = (code: number) => new Response(null, { status: code });

    if (method === 'PROPFIND') {
      const depth = new Headers(init.headers).get('Depth');
      if (`${url.origin}${url.pathname}` === ROOT) return this.multistatus([this.entry(url.pathname)]);
      if (url.pathname !== FOLDER) return status(404);
      if (!this.folder) return status(404);
      const children = depth === '1' ? [...this.files.keys()].map((n) => this.entry(FOLDER + n, n)) : [];
      return this.multistatus([this.entry(FOLDER), ...children]);
    }
    if (method === 'MKCOL') {
      if (this.folder) return status(405);
      this.folder = true;
      return status(201);
    }
    const name = url.pathname.startsWith(FOLDER) ? url.pathname.slice(FOLDER.length) : null;
    if (!name) throw new Error(`Unexpected ${method} ${url}`);
    if (method === 'PUT') {
      if (!this.folder) return status(409);
      const existed = this.files.has(name);
      this.add(name, String(init.body));
      return status(existed ? 204 : 201);
    }
    const file = this.files.get(name);
    if (!file) return status(404);
    if (method === 'GET') return new Response(file.content);
    if (method === 'DELETE') {
      this.files.delete(name);
      return status(204);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };

  private entry(path: string, name?: string): string {
    const d = this.prefix;
    const file = name ? this.files.get(name) : undefined;
    const href = (this.fullHrefs ? 'https://cloud.example.com' : '') + path;
    const props = file
      ? `<${d}:getlastmodified>${file.modified}</${d}:getlastmodified>` +
        (this.etags ? `<${d}:getetag>"${file.etag}"</${d}:getetag>` : '')
      : '';
    return `<${d}:response><${d}:href>${href}</${d}:href><${d}:propstat><${d}:prop>${props}</${d}:prop>
      <${d}:status>HTTP/1.1 200 OK</${d}:status></${d}:propstat></${d}:response>`;
  }

  private multistatus(responses: string[]): Response {
    const d = this.prefix;
    const xml = `<?xml version="1.0"?><${d}:multistatus xmlns:${d}="DAV:">${responses.join('')}</${d}:multistatus>`;
    return new Response(xml, { status: 207, headers: { 'Content-Type': 'application/xml' } });
  }

  names(): string[] {
    return [...this.files.keys()].sort();
  }
}

let dav: FakeDav;
const backend = () => new WebDavBackend({ url: ROOT, username: 'me', password: 'secret' }, 'here');
const jsons = (files: { json: string }[]) => files.map((f) => f.json).sort();

beforeEach(() => {
  dav = new FakeDav();
  vi.stubGlobal('fetch', dav.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('serverUrl', () => {
  it('ends the folder address with a slash, and drops anything after the path', () => {
    expect(serverUrl(' https://cloud.example.com/remote.php/dav/files/me#x ')).toBe(ROOT);
    expect(serverUrl(ROOT)).toBe(ROOT);
  });

  it('turns down plain http, unless to this computer', () => {
    expect(() => serverUrl('http://cloud.example.com/dav/')).toThrow('https://');
    expect(serverUrl('http://localhost:8080/dav')).toBe('http://localhost:8080/dav/');
  });

  it('turns down what isn’t an address', () => {
    expect(() => serverUrl('cloud.example.com')).toThrow('full address');
  });
});

describe('WebDavBackend', () => {
  describe('check', () => {
    it('passes when the address and sign-in work', async () => {
      await expect(backend().check()).resolves.toBeUndefined();
    });

    it('says what to fix when they don’t', async () => {
      dav.failWith = 'offline';
      await expect(backend().check()).rejects.toThrow('CORS');
      dav.failWith = 405;
      await expect(backend().check()).rejects.toThrow("isn't a WebDAV folder");
      dav.failWith = 401;
      await expect(backend().check()).rejects.toBeInstanceOf(WebDavAuthError);
    });
  });

  describe('pull', () => {
    it("reads every other device's file, and nothing else, on a first pull", async () => {
      dav.add('device-phone.json', 'phone', at(3));
      dav.add('device-tablet.json', 'tablet');
      dav.add('device-here.json', 'mine');
      dav.add('notes.txt', 'something else');

      const { files } = await backend().pull(null);
      expect(jsons(files)).toEqual(['phone', 'tablet']);
      expect(files.find((f) => f.json === 'phone')!.modifiedAt).toBe(Date.parse(at(3)));
    });

    it('finds nothing, without failing, before any device has made the folder', async () => {
      expect((await backend().pull(null)).files).toEqual([]);
    });

    it('then reads only the files changed since, in one listing when none did', async () => {
      dav.add('device-phone.json', 'phone');
      dav.add('device-tablet.json', 'tablet');
      const { cursor } = await backend().pull(null);

      dav.add('device-laptop.json', 'laptop');
      dav.add('device-here.json', 'mine');
      dav.add('device-phone.json', 'phone, edited');
      const later = await backend().pull(cursor);
      expect(jsons(later.files)).toEqual(['laptop', 'phone, edited']);

      dav.calls = [];
      expect((await backend().pull(later.cursor)).files).toEqual([]);
      expect(dav.calls).toEqual(['PROPFIND ']);
    });

    it('tells changes by modified time when the server gives no ETags', async () => {
      dav.etags = false;
      dav.add('device-phone.json', 'phone', at(1));
      const { cursor } = await backend().pull(null);
      dav.add('device-phone.json', 'phone, edited', at(0));
      expect(jsons((await backend().pull(cursor)).files)).toEqual(['phone, edited']);
    });

    it('reads replies with any namespace prefix and full hrefs', async () => {
      dav.prefix = 'D';
      dav.fullHrefs = true;
      dav.add('device-phone.json', 'phone');
      expect(jsons((await backend().pull(null)).files)).toEqual(['phone']);
    });
  });

  describe('push', () => {
    it("makes the app's folder and this device's file the first time", async () => {
      await backend().push('mine');
      expect(dav.files.get('device-here.json')?.content).toBe('mine');
      expect(dav.calls).toEqual(['PUT device-here.json', 'MKCOL ', 'PUT device-here.json']);
    });

    it('writes straight to the file after that', async () => {
      dav.add('device-here.json', 'old');
      dav.calls = [];
      await backend().push('new');
      expect(dav.files.get('device-here.json')?.content).toBe('new');
      expect(dav.calls).toEqual(['PUT device-here.json']);
    });
  });

  describe('removeStale', () => {
    const MAX_AGE = 90 * DAY;

    it("deletes other devices' files unchanged for longer than maxAge", async () => {
      dav.add('device-here.json', 'mine', at(0));
      dav.add('device-phone.json', 'phone', at(89));
      dav.add('device-drawer.json', 'drawer', at(91));
      dav.add('notes.txt', 'something else', at(300));
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: true });
      expect(dav.names()).toEqual(['device-here.json', 'device-phone.json', 'notes.txt']);
    });

    it('measures age back from the newest file, not this device clock', async () => {
      dav.add('device-here.json', 'mine', at(400));
      dav.add('device-phone.json', 'phone', at(380));
      await backend().removeStale(MAX_AGE);
      expect(dav.names()).toEqual(['device-here.json', 'device-phone.json']);
    });

    it("never deletes this device's own file, and says when it's missing", async () => {
      dav.add('device-here.json', 'mine', at(200));
      dav.add('device-phone.json', 'phone', at(0));
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: true });
      expect(dav.names()).toContain('device-here.json');

      dav.files.clear();
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: false });
    });
  });

  describe('errors', () => {
    it('reports a turned-down username or password', async () => {
      dav.failWith = 401;
      await expect(backend().pull(null)).rejects.toBeInstanceOf(WebDavAuthError);
    });

    it('reports being offline', async () => {
      dav.failWith = 'offline';
      await expect(backend().push('mine')).rejects.toBeInstanceOf(WebDavUnreachableError);
    });

    it('reports any other failure with its status', async () => {
      dav.failWith = 500;
      await expect(backend().pull(null)).rejects.toThrow('The WebDAV server replied 500.');
    });
  });
});
