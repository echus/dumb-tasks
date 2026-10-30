import { describe, expect, it } from 'vitest';
import { deviceFileName, isDeviceFile, staleFiles } from '../../../src/lib/sync/device-files';

const DAY = 86_400_000;

describe('device files', () => {
  it('are named after the device, and told apart from other files', () => {
    expect(deviceFileName('01ABC')).toBe('device-01ABC.json');
    expect(isDeviceFile(deviceFileName('01ABC'))).toBe(true);
    expect(isDeviceFile('notes.txt')).toBe(false);
  });

  describe('staleFiles', () => {
    const file = (name: string, daysAgo: number) => ({ name, modifiedAt: 1_000 * DAY - daysAgo * DAY });
    const stale = (files: { name: string; modifiedAt: number }[]) =>
      staleFiles(files, 'device-here.json', 90 * DAY, (f) => f.modifiedAt).map((f) => f.name);

    it("finds other devices' files unchanged for longer than maxAge", () => {
      const files = [file('device-here.json', 0), file('device-phone.json', 89), file('device-drawer.json', 91)];
      expect(stale(files)).toEqual(['device-drawer.json']);
    });

    it('measures age back from the newest file, not this device clock', () => {
      expect(stale([file('device-here.json', 400), file('device-phone.json', 380)])).toEqual([]);
    });

    it("never counts this device's own file", () => {
      expect(stale([file('device-here.json', 200), file('device-phone.json', 0)])).toEqual([]);
    });
  });
});
