import { exportData, importData, parseDataFile } from './data-file';
import type { DataFile } from './types';

// Sync is backend-agnostic: pull the data file, merge it into local data, and push the
// result back if the remote copy is missing anything. Merging is per field, so a push that
// races another device's never loses data for good: the losing device still has its
// changes locally and pushes them again on its next sync.

export interface SyncBackend {
  /** The remote data file and a version tag for it, or null if there isn't one yet. */
  load(): Promise<{ json: string; version: string } | null>;
  /**
   * Writes the data file, unless it has changed since `version` was loaded (null: it
   * didn't exist). Returns false if it had, so the caller can pull and merge again.
   */
  save(json: string, version: string | null): Promise<boolean>;
}

export class SyncConflictError extends Error {
  constructor() {
    super('The data file kept changing while syncing.');
  }
}

/** JSON with object keys sorted, so equal data always gives the same string. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );
}

/** What a data file holds, ignoring when it was written and the order of its tasks. */
export function contentKey(data: DataFile): string {
  const tasks = [...data.tasks].sort((a, b) => a.id.localeCompare(b.id));
  return stableStringify({ tasks, memory: data.memory, memoryUpdatedAt: data.memoryUpdatedAt });
}

/** One full sync. Returns whether anything was pushed. */
export async function syncWith(backend: SyncBackend, tries = 3): Promise<{ pushed: boolean }> {
  for (let i = 0; i < tries; i++) {
    const remote = await backend.load();
    let remoteKey: string | null = null;
    if (remote) {
      const data = parseDataFile(remote.json);
      await importData(data);
      remoteKey = contentKey(data);
    }

    const local = await exportData();
    if (contentKey(local) === remoteKey) return { pushed: false };
    if (await backend.save(JSON.stringify(local), remote?.version ?? null)) return { pushed: true };
  }
  throw new SyncConflictError();
}

// Task writes call localChanged() so sync can push them soon after. A listener rather than a
// direct call keeps task code free of network code.
let listener: () => void = () => {};

export function onLocalChange(fn: () => void) {
  listener = fn;
}

export function localChanged() {
  listener();
}
