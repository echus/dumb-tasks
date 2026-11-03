import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { db } from '$lib/db';
import { NewerVersionError, parseDataFile, SCHEMA_VERSION } from '$lib/sync/data-file';
import { addTask } from '$lib/tasks/tasks';

const file = (data: object) => JSON.stringify({ tasks: [], ...data });

describe('parseDataFile', () => {
  it('reads a file from this version', () => {
    expect(parseDataFile(file({ schemaVersion: SCHEMA_VERSION }))).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      tasks: [],
      memory: '',
    });
  });

  it('refuses a file from a newer version', () => {
    expect(() => parseDataFile(file({ schemaVersion: SCHEMA_VERSION + 1 }))).toThrow(NewerVersionError);
  });

  it('refuses a file with a damaged task', async () => {
    await db.tasks.clear();
    await addTask('call mum');
    const good = (await db.tasks.toArray())[0];
    expect(parseDataFile(file({ schemaVersion: SCHEMA_VERSION, tasks: [good] })).tasks).toHaveLength(1);
    const damaged = [
      { bucket: 'inbox' },
      { position: '' },
      { deadline: { date: 'soon', phrase: null } },
      { bucketHistory: null },
      { fieldUpdatedAt: { text: 'yesterday' } },
      { completedAt: 0 },
    ];
    for (const change of damaged) {
      const tasks = [good, { ...good, id: 'other', ...change }];
      expect(() => parseDataFile(file({ schemaVersion: SCHEMA_VERSION, tasks }))).toThrow('damaged');
    }
  });

  it("refuses something that isn't a data file", () => {
    for (const json of ['null', '[]', file({}), file({ schemaVersion: 0 }), file({ schemaVersion: 1.5 })]) {
      expect(() => parseDataFile(json)).toThrow('is not a Dumb Tasks backup');
    }
  });
});
