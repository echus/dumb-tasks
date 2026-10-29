import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { onLocalChange, syncWith, type SyncBackend } from './sync';
import {
  addDemoTasks,
  addTask,
  completeTask,
  deleteTask,
  editText,
  isActive,
  isDemoTask,
  isUneditedDemo,
  moveTask,
} from './tasks';
import type { DataFile } from './types';

const t0 = new Date(2026, 9, 26, 9, 0);
const later = (mins: number) => new Date(t0.getTime() + mins * 60_000);

/** A remote data file in memory. `beforeSave` lets a test sneak in another device's write. */
class MemoryBackend implements SyncBackend {
  json: string | null = null;
  version = 0;
  saves = 0;
  beforeSave: (() => void) | null = null;

  async load() {
    return this.json === null ? null : { json: this.json, version: String(this.version) };
  }

  async save(json: string, version: string | null) {
    this.beforeSave?.();
    this.beforeSave = null;
    const current = this.json === null ? null : String(this.version);
    if (current !== version) return false;
    this.json = json;
    this.version++;
    this.saves++;
    return true;
  }

  data(): DataFile {
    return JSON.parse(this.json!);
  }

  /** Another device edits the file directly. */
  edit(fn: (data: DataFile) => void) {
    const data = this.data();
    fn(data);
    this.json = JSON.stringify(data);
    this.version++;
  }
}

const activeTexts = async () =>
  (await db.tasks.toArray())
    .filter(isActive)
    .map((t) => t.text)
    .sort();

let remote: MemoryBackend;

beforeEach(async () => {
  await db.tasks.clear();
  await db.meta.clear();
  await db.settings.clear();
  remote = new MemoryBackend();
});

describe('sync', () => {
  it('creates the remote file on first sync', async () => {
    await addTask('buy milk', t0);
    expect(await syncWith(remote)).toEqual({ pushed: true });
    expect(remote.data().tasks.map((t) => t.text)).toEqual(['buy milk']);
  });

  it('restores a new device from the remote file without pushing', async () => {
    await addTask('buy milk', t0);
    await addTask('pay rent', later(1));
    await syncWith(remote);

    await db.tasks.clear(); // a fresh device
    expect(await syncWith(remote)).toEqual({ pushed: false });
    expect(await activeTexts()).toEqual(['buy milk', 'pay rent']);
  });

  it("doesn't push when nothing changed", async () => {
    await addTask('buy milk', t0);
    await syncWith(remote);
    expect(await syncWith(remote)).toEqual({ pushed: false });
    expect(remote.saves).toBe(1);
  });

  it('keeps an edit here and a move on another device', async () => {
    const id = (await addTask('buy milk', t0))!;
    await syncWith(remote);

    remote.edit((data) => {
      const task = data.tasks[0];
      task.bucket = 'week';
      task.fieldUpdatedAt.bucket = later(2).toISOString();
    });
    await editText(id, 'buy oat milk', later(1));

    expect(await syncWith(remote)).toEqual({ pushed: true });
    const local = (await db.tasks.get(id))!;
    expect(local).toMatchObject({ text: 'buy oat milk', bucket: 'week' });
    expect(remote.data().tasks[0]).toMatchObject({ text: 'buy oat milk', bucket: 'week' });
  });

  it('keeps an edit made after syncing, even with this clock behind the other device', async () => {
    const id = (await addTask('buy milk', t0))!;
    await syncWith(remote);

    remote.edit((data) => {
      const task = data.tasks[0];
      task.text = 'buy oat milk';
      task.fieldUpdatedAt.text = later(10).toISOString(); // its clock is 10 minutes ahead
    });
    await syncWith(remote);
    await editText(id, 'buy soy milk', later(1));

    await syncWith(remote);
    expect(remote.data().tasks[0].text).toBe('buy soy milk');
  });

  it('merges again when another device writes mid-sync', async () => {
    await addTask('buy milk', t0);
    await syncWith(remote);

    await addTask('pay rent', later(1));
    remote.beforeSave = () =>
      remote.edit((data) => {
        data.tasks.push({ ...data.tasks[0], id: 'other-device-task', text: 'call mum' });
      });

    expect(await syncWith(remote)).toEqual({ pushed: true });
    expect(await activeTexts()).toEqual(['buy milk', 'call mum', 'pay rent']);
    expect(remote.data().tasks.map((t) => t.text).sort()).toEqual(['buy milk', 'call mum', 'pay rent']);
  });

  it('drops tasks deleted or completed over 90 days ago, here and in the remote file', async () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
    const old = (await addTask('old', daysAgo(200)))!;
    const recent = (await addTask('recent', daysAgo(200)))!;
    const done = (await addTask('done', daysAgo(200)))!;
    const longDone = (await addTask('long done', daysAgo(200)))!;
    await deleteTask(recent, daysAgo(89));
    await completeTask(done, daysAgo(89));
    await completeTask(longDone, daysAgo(150));
    await syncWith(remote);

    // Another device deleted it long ago
    remote.edit((data) => {
      const task = data.tasks.find((t) => t.id === old)!;
      task.deletedAt = task.fieldUpdatedAt.deletedAt = daysAgo(91).toISOString();
    });

    expect(await syncWith(remote)).toEqual({ pushed: true });
    const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id).sort();
    expect(ids(await db.tasks.toArray())).toEqual([recent, done].sort());
    expect(ids(remote.data().tasks)).toEqual([recent, done].sort());
  });

  describe('on a first sync, with demo tasks', () => {
    const replace = isUneditedDemo;

    it('replaces them with the tasks of an account that has a data file', async () => {
      await addTask('buy milk', t0);
      await syncWith(remote);

      await db.tasks.clear(); // a new device, showing the demo
      await addDemoTasks(t0);
      expect(await syncWith(remote, { replace })).toEqual({ pushed: false });
      expect(await activeTexts()).toEqual(['buy milk']);
    });

    it('pushes them to a new account', async () => {
      await addDemoTasks(t0);
      expect(await syncWith(remote, { replace })).toEqual({ pushed: true });
      expect(remote.data().tasks.filter(isDemoTask)).toHaveLength(4);
    });

    it('keeps tasks the user added or retyped', async () => {
      remote.json = JSON.stringify({ schemaVersion: 1, tasks: [] }); // every task long deleted
      await addDemoTasks(t0);
      const [retyped] = await db.tasks.toArray();
      await editText(retyped.id, 'call mum', later(1));
      await addTask('pay rent', later(2));

      expect(await syncWith(remote, { replace })).toEqual({ pushed: true });
      expect(remote.data().tasks.map((t) => t.text).sort()).toEqual(['call mum', 'pay rent']);
    });

    it('keeps the ones the account has, with what was done to them here', async () => {
      await addDemoTasks(t0);
      await syncWith(remote);
      const [done] = await db.tasks.toArray();
      await completeTask(done.id, later(1));

      expect(await syncWith(remote, { replace })).toEqual({ pushed: true });
      expect(remote.data().tasks.filter(isDemoTask)).toHaveLength(4);
      expect(remote.data().tasks.find((t) => t.id === done.id)!.completedAt).not.toBeNull();
    });
  });

  it('hears about local task writes', async () => {
    let calls = 0;
    onLocalChange(() => calls++);
    const id = (await addTask('buy milk', t0))!;
    await moveTask(id, 'week', null, later(1));
    expect(calls).toBe(2);
    onLocalChange(() => {});
  });
});
