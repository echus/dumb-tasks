import type { Task } from './types';

// Fields merged last-write-wins using fieldUpdatedAt. Everything else is
// either immutable (id, createdAt) or merged specially (bucketHistory).
export const MERGED_FIELDS = [
  'text',
  'bucket',
  'position',
  'sorted',
  'completedAt',
  'deletedAt',
  'deadline',
  'icon',
  'colour',
  'aiNote',
] as const satisfies readonly (keyof Task)[];

export type MergedField = (typeof MERGED_FIELDS)[number];

function copyField<K extends MergedField>(target: Task, source: Task, field: K) {
  target[field] = source[field];
}

/** Combines two copies of the same task; the result is the same whichever order they're passed in. */
export function mergeTask(a: Task, b: Task): Task {
  const merged: Task = { ...a, fieldUpdatedAt: { ...a.fieldUpdatedAt } };

  for (const field of MERGED_FIELDS) {
    const ta = a.fieldUpdatedAt[field] ?? '';
    const tb = b.fieldUpdatedAt[field] ?? '';
    const bWins = tb > ta || (tb === ta && JSON.stringify(b[field]) > JSON.stringify(a[field]));
    if (bWins) {
      copyField(merged, b, field);
      merged.fieldUpdatedAt[field] = tb;
    }
  }

  const seen = new Set<string>();
  merged.bucketHistory = [...a.bucketHistory, ...b.bucketHistory]
    .filter((h) => {
      const key = `${h.at}|${h.bucket}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.at.localeCompare(y.at));

  merged.createdAt = a.createdAt < b.createdAt ? a.createdAt : b.createdAt;
  return merged;
}
