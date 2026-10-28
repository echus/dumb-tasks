import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { NewerVersionError, parseDataFile, SCHEMA_VERSION } from './data-file';

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

  it("refuses something that isn't a data file", () => {
    for (const json of ['null', '[]', file({}), file({ schemaVersion: 0 }), file({ schemaVersion: 1.5 })]) {
      expect(() => parseDataFile(json)).toThrow("doesn't look like a Dumb Tasks backup");
    }
  });
});
