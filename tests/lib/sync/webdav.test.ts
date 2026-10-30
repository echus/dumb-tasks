// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://dumbtasks.app/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { at, DAY, FakeDav, ROOT } from '../../helpers/fake-dav';
import { readmeAllows } from '../../helpers/readme';
import { serverUrl, WebDavAuthError, WebDavBackend, WebDavUnreachableError } from '../../../src/lib/sync/webdav';

let dav: FakeDav;
let now = Date.parse('2026-10-29T12:00:00Z');
const backend = () => new WebDavBackend({ url: ROOT, username: 'me', password: 'secret' }, 'here');
const jsons = (files: { json: string }[]) => files.map((f) => f.json).sort();

beforeEach(() => {
  dav = new FakeDav();
  vi.stubGlobal('fetch', dav.fetch);
  // A minute on from the last test, so its writes don't hold up this one's (see push)
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime((now += 60_000));
});

afterEach(() => {
  vi.useRealTimers();
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
      await expect(backend().check()).rejects.toThrow('is not a WebDAV folder');
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

    it('writes again only a second later, so the server can tell the writes apart', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      await backend().push('one');
      const again = backend().push('two');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(dav.files.get('device-here.json')?.content).toBe('one');
      await vi.advanceTimersByTimeAsync(100);
      await again;
      expect(dav.files.get('device-here.json')?.content).toBe('two');
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

    it('leaves a file it cannot delete, without failing', async () => {
      dav.add('device-here.json', 'mine', at(0));
      dav.add('device-drawer.json', 'drawer', at(91));
      dav.failDelete = 423;
      expect(await backend().removeStale(MAX_AGE)).toEqual({ hasOwnFile: true });
      expect(dav.names()).toEqual(['device-drawer.json', 'device-here.json']);
    });

    it('still fails when the server turns down the sign-in', async () => {
      dav.add('device-here.json', 'mine', at(0));
      dav.add('device-drawer.json', 'drawer', at(91));
      dav.failDelete = 401;
      await expect(backend().removeStale(MAX_AGE)).rejects.toBeInstanceOf(WebDavAuthError);
    });
  });

  // Browsers only send what the server's CORS setup allows, so the README's has to cover it all
  describe('requests', () => {
    it("use only the methods and headers the README's server setup allows", async () => {
      await backend().check();
      await backend().push('mine'); // into no folder yet: PUT, MKCOL, PUT
      dav.add('device-phone.json', 'phone');
      dav.add('device-drawer.json', 'drawer', at(91));
      await backend().removeStale(90 * DAY);
      await backend().pull(null);

      const methods = new Set(dav.calls.map((call) => call.split(' ')[0]));
      expect([...methods].sort()).toEqual(['DELETE', 'GET', 'MKCOL', 'PROPFIND', 'PUT']);
      expect([...methods].filter((m) => !readmeAllows('Methods').includes(m))).toEqual([]);
      const allowed = readmeAllows('Headers').map((h) => h.toLowerCase());
      expect([...dav.headers].filter((h) => !allowed.includes(h))).toEqual([]);
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

    it('gives up on a server that stops answering', async () => {
      const timeout = AbortSignal.timeout.bind(AbortSignal);
      const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(1));
      dav.failWith = 'stall';
      await expect(backend().pull(null)).rejects.toBeInstanceOf(WebDavUnreachableError);
      expect(spy).toHaveBeenCalledWith(30_000);
      spy.mockRestore();
    });

    it('reports any other failure with its status', async () => {
      dav.failWith = 500;
      await expect(backend().pull(null)).rejects.toThrow('The WebDAV server sent error 500.');
    });
  });
});
