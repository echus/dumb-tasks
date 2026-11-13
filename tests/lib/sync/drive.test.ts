import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveAuthError, DriveBackend, DriveUnreachableError } from '$lib/sync/drive';
import { at, DAY, FakeDrive } from '../../helpers/fake-drive';

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
      expect(await backend().removeStale(MAX_AGE)).toEqual({ stale: ['device-drawer.json'], hasOwnFile: true });
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
      expect(await backend().removeStale(MAX_AGE)).toEqual({ stale: [], hasOwnFile: true });
      expect(drive.names()).toContain('device-here.json');

      drive.files.clear();
      expect(await backend().removeStale(MAX_AGE)).toEqual({ stale: [], hasOwnFile: false });
    });

    it('deletes the old shared file however recent, and leaves other files alone', async () => {
      drive.add('device-here.json', 'mine', at(0));
      drive.add('dumb-tasks.json', 'old shared file', at(0));
      drive.add('notes.txt', 'something else', at(300));
      await backend().removeStale(MAX_AGE);
      expect(drive.names()).toEqual(['device-here.json', 'notes.txt']);
    });
  });

  describe('with a new token, until it is known to be the right account', () => {
    beforeEach(() => {
      drive.add('device-here.json', 'mine', at(0));
      drive.add('device-drawer.json', 'drawer', at(91));
      drive.add('device-phone.json', 'phone');
    });

    it('reads, but returns nothing until then', async () => {
      let pass!: () => void;
      const b = new DriveBackend('token', 'here', null, new Promise((resolve) => (pass = resolve)));
      const pulled = b.pull(null);
      await vi.waitFor(() => expect(drive.calls.filter((c) => c.startsWith('GET /files/'))).toHaveLength(2));
      pass();
      expect(jsons((await pulled).files)).toEqual(['drawer', 'phone']);
    });

    it('writes and deletes nothing when it is another account', async () => {
      const other = Promise.reject(new Error('Another account'));
      const b = new DriveBackend('token', 'here', null, other);
      await expect(b.pull(null)).rejects.toThrow('Another account');
      await expect(b.removeStale(90 * DAY)).rejects.toThrow('Another account');
      await expect(b.push('changed')).rejects.toThrow('Another account');
      expect(drive.calls.filter((c) => !c.startsWith('GET'))).toEqual([]);
      expect(drive.names()).toEqual(['device-drawer.json', 'device-here.json', 'device-phone.json']);
      expect(drive.contents('device-here.json')).toBe('mine');
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
      await expect(backend().pull(null)).rejects.toThrow('Google Drive sent error 500.');
    });
  });
});
