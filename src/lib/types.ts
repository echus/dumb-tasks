export const BUCKETS = ['today', 'week', 'month', 'icebox'] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today',
  week: 'Week',
  month: 'Month',
  icebox: 'Icebox',
};

export const CATEGORIES = [
  'home',
  'errands',
  'health',
  'people',
  'money',
  'work',
  'creative',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Task {
  id: string; // ULID
  text: string; // the only user-edited field
  bucket: Bucket;
  position: string; // fractional index within the bucket
  createdAt: string; // ISO timestamps throughout
  bucketHistory: { bucket: Bucket; at: string }[];
  sorted: boolean; // false until first moved → drives the "new" marker
  completedAt: string | null;
  deletedAt: string | null; // tombstone

  // hidden — never shown as editable fields
  deadline: string | null; // YYYY-MM-DD
  deadlineSource: 'parsed' | 'ai' | null;
  deadlineText: string | null; // the phrase the deadline was parsed from
  icon: string | null;
  category: Category | null;
  iconSource: 'auto' | 'ai';
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
