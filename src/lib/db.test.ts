import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { db, isDatabaseNewer } from './db';

describe('isDatabaseNewer', () => {
  it('is false for the version this app declares', async () => {
    expect(await isDatabaseNewer()).toBe(false);
  });

  it('is true once a newer version of the app has upgraded the database', async () => {
    db.close();
    const newer = new Dexie('dumb-tasks');
    newer.version(db.verno).stores({ tasks: 'id, bucket', meta: 'key', settings: 'key' });
    newer.version(db.verno + 1).stores({ tasks: 'id, bucket, completedAt' });
    await newer.open();
    newer.close();

    expect(await isDatabaseNewer()).toBe(true);
  });
});
