export const BUCKETS = ['today', 'week', 'month', 'icebox'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  icebox: 'Icebox',
};

// One object so date and phrase merge as a unit: a deadline the AI set can never end up
// paired with a phrase parsed on another device. Build it with makeDeadline so key order
// is always the same (merge tie-breaks compare JSON).
export interface Deadline {
  date: string; // YYYY-MM-DD
  phrase: string | null; // where in the text it was parsed from (underlined); null if the AI set it
}

export function makeDeadline(date: string, phrase: string | null): Deadline {
  return { date, phrase };
}

export interface Task {
  id: string; // ULID
  text: string; // the only user-edited field
  bucket: Bucket;
  position: string; // fractional index within the bucket
  createdAt: string; // ISO timestamps throughout
  bucketHistory: { bucket: Bucket; at: string }[]; // every move, for the AI planner
  sorted: boolean; // false until first moved, for the AI planner
  completedAt: string | null;
  deletedAt: string | null; // tombstone

  // Derived from the text or set by the AI; never edited directly
  deadline: Deadline | null;
  icon: string | null; // an emoji; null: no keyword matched
  // Both are re-derived whenever the text is edited, replacing anything the AI set.
  colour: string; // icon circle's CSS colour: random, re-picked when the icon changes
  aiNote: string;

  fieldUpdatedAt: Record<string, string>; // per-field timestamps for merging
}

export interface Meta {
  key: string;
  value: string;
  updatedAt: string;
}

export const SCHEMA_VERSION = 1;

export interface DataFile {
  schemaVersion: number;
  exportedAt: string;
  tasks: Task[];
  memory: string;
  memoryUpdatedAt: string;
}
