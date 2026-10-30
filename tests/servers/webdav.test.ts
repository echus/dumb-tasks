// @vitest-environment jsdom
import { beforeEach, describe, expect, inject, it } from 'vitest';
import { WebDavAuthError, WebDavBackend } from '../../src/lib/sync/webdav';
import { readmeAllows } from '../helpers/readme';

// The app's WebDAV code against each real server, set up as the README says (see setup.ts).
// Node doesn't check CORS as browsers do, so the CORS tests ask what a browser would.

const ORIGIN = 'https://tasks.example.com'; // the README's example, as the servers are set up

describe.each(inject('servers'))('$name', (account) => {
  const device = (name: string, password = account.password) =>
    new WebDavBackend({ ...account, password }, name);
  const read = async (files: Promise<{ files: { json: string }[] }>) => (await files).files.map((f) => f.json);
  const auth = (password = account.password) => `Basic ${btoa(`${account.username}:${password}`)}`;

  beforeEach(async () => {
    // A fresh start: no app folder, as before any device synced
    await fetch(new URL('dumb-tasks/', account.url), { method: 'DELETE', headers: { Authorization: auth() } });
  });

  it('passes the check, and says when there is no folder at the address', async () => {
    await expect(device('here').check()).resolves.toBeUndefined();
    const missing = new WebDavBackend({ ...account, url: `${account.url}missing/` }, 'here');
    await expect(missing.check()).rejects.toThrow('There is no folder at this address.');
  });

  it('turns down a wrong password', async () => {
    await expect(device('here', 'wrong').check()).rejects.toBeInstanceOf(WebDavAuthError);
    await expect(device('here', 'wrong').pull(null)).rejects.toBeInstanceOf(WebDavAuthError);
  });

  it("makes the app's folder on the first push, and other devices read the file", async () => {
    expect(await read(device('phone').pull(null))).toEqual([]);
    await device('here').push('first');
    const { files } = await device('phone').pull(null);
    expect(files.map((f) => f.json)).toEqual(['first']);
    expect(Math.abs(files[0].modifiedAt - Date.now())).toBeLessThan(60_000); // read the server's time
  });

  it('tells every write apart, and reads nothing when nothing changed', async () => {
    await device('here').push('one');
    const { cursor } = await device('phone').pull(null);
    expect(await read(device('phone').pull(cursor))).toEqual([]);
    await device('here').push('two'); // the same size, within the same second
    expect(await read(device('phone').pull(cursor))).toEqual(['two']);
  });

  it("deletes other devices' stale files, by the server's clock", async () => {
    await device('drawer').push('old');
    await new Promise((resolve) => setTimeout(resolve, 2_100)); // servers keep whole seconds
    await device('here').push('mine');
    expect(await device('here').removeStale(1_000)).toEqual({ hasOwnFile: true });
    expect(await read(device('phone').pull(null))).toEqual(['mine']);
  });

  describe('CORS', () => {
    const methods = readmeAllows('Methods').filter((m) => m !== 'OPTIONS');
    const headers = readmeAllows('Headers').map((h) => h.toLowerCase());
    const list = (value: string | null) => (value ?? '').split(',').map((item) => item.trim().toLowerCase());

    it.each(methods)('lets the browser send %s, with every header the app sends', async (method) => {
      // The check a browser makes first, without a password
      const res = await fetch(account.url, {
        method: 'OPTIONS',
        headers: {
          Origin: ORIGIN,
          'Access-Control-Request-Method': method,
          'Access-Control-Request-Headers': headers.join(','),
        },
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
      expect(list(res.headers.get('Access-Control-Allow-Methods'))).toContain(method.toLowerCase());
      expect(list(res.headers.get('Access-Control-Allow-Headers'))).toEqual(expect.arrayContaining(headers));
    });

    it('lets the app read every reply, errors too', async () => {
      const propfind = (url: string, password?: string) =>
        fetch(url, { method: 'PROPFIND', headers: { Origin: ORIGIN, Depth: '0', Authorization: auth(password) } });
      const replies = [
        await propfind(account.url),
        await propfind(account.url, 'wrong'),
        await propfind(`${account.url}missing/`),
      ];
      expect(replies.map((r) => r.status)).toEqual([207, 401, 404]);
      for (const reply of replies) expect(reply.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    });
  });
});
