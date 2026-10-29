import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { addDemoTasks, isDemoTask } from '../tasks/demo-tasks';
import { addTask, completeTask, deleteTask, editText, isActive, moveTask } from '../tasks/tasks';
import type { DataFile, Task } from '../types';
import { startFrom, syncWith, type SyncBackend, type SyncState } from './engine';
import { onLocalChange } from './local-changes';

const t0 = new Date(2026, 9, 26, 9, 0);
const later = (mins: number) => new Date(t0.getTime() + mins * 60_000);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/**
 * Every device's data file in memory, as this device sees them. The local database plays
 * this device; tests write the other devices' files directly.
 */
class MemoryBackend implements SyncBackend {
  files = new Map<string, { json: string; seq: number; modifiedAt: number }>(); // by device
  seq = 0;
  pushes = 0;

  async pull(cursor: string | null) {
    const since = cursor === null ? -1 : Number(cursor);
    const files = [...this.files]
      .filter(([device, f]) => device !== 'here' && f.seq > since)
      .map(([, { json, modifiedAt }]) => ({ json, modifiedAt }));
    return { files, cursor: String(this.seq) };
  }

  async push(json: string) {
    this.write('here', JSON.parse(json));
    this.pushes++;
  }

  // As Drive's: measured back from the newest file
  async removeStale(maxAge: number) {
    const newest = Math.max(...[...this.files.values()].map((f) => f.modifiedAt));
    for (const [device, f] of this.files) {
      if (device !== 'here' && f.modifiedAt < newest - maxAge) this.files.delete(device);
    }
    return { hasOwnFile: this.files.has('here') };
  }

  data(device = 'here'): DataFile {
    return JSON.parse(this.files.get(device)!.json);
  }

  texts(device = 'here'): string[] {
    return this.data(device)
      .tasks.map((t) => t.text)
      .sort();
  }

  /** Another device writes its file. */
  write(device: string, data: DataFile, at = new Date()) {
    this.files.set(device, { json: JSON.stringify(data), seq: ++this.seq, modifiedAt: at.getTime() });
  }

  /** Another device, which has synced with this one, writes a change to its file. */
  edit(device: string, fn: (data: DataFile) => void, at = new Date()) {
    const data = this.data(this.files.has(device) ? device : 'here');
    fn(data);
    this.write(device, data, at);
  }
}

const emptyFile = (): DataFile => ({
  schemaVersion: 1,
  exportedAt: t0.toISOString(),
  tasks: [],
  memory: '',
  memoryUpdatedAt: new Date(0).toISOString(),
});

const activeTexts = async () =>
  (await db.tasks.toArray())
    .filter(isActive)
    .map((t) => t.text)
    .sort();

let remote: MemoryBackend;
let state: SyncState;

/** Syncs as the app does, keeping the state between syncs. Returns whether it pushed. */
async function sync(options: Parameters<typeof syncWith>[2] = {}): Promise<boolean> {
  const { pushed, ...next } = await syncWith(remote, state, options);
  state = next;
  return pushed;
}

beforeEach(async () => {
  await db.tasks.clear();
  await db.meta.clear();
  await db.settings.clear();
  remote = new MemoryBackend();
  state = { cursor: null, pushedKey: null };
});

describe('sync', () => {
  it("writes this device's file on first sync", async () => {
    await addTask('buy milk', t0);
    expect(await sync()).toBe(true);
    expect(remote.texts()).toEqual(['buy milk']);
  });

  it("restores a new device from another device's file", async () => {
    await addTask('buy milk', t0);
    await sync();
    remote.edit('phone', () => {}); // the phone has it too
    await db.tasks.clear(); // and this is a fresh device
    remote.files.delete('here');
    state = { cursor: null, pushedKey: null };

    await sync();
    expect(await activeTexts()).toEqual(['buy milk']);
  });

  it("doesn't push when nothing changed", async () => {
    await addTask('buy milk', t0);
    await sync();
    expect(await sync()).toBe(false);
    expect(remote.pushes).toBe(1);
  });

  it('reads only the files that changed since the last sync', async () => {
    await addTask('buy milk', t0);
    await sync();
    remote.edit('phone', (data) => data.tasks.push({ ...data.tasks[0], id: 'p', text: 'call mum' }));
    await sync();
    await db.tasks.delete('p'); // gone here only: an unchanged phone file doesn't bring it back

    await sync();
    expect(await activeTexts()).toEqual(['buy milk']);
  });

  it("takes in another device's change once, then stops", async () => {
    await addTask('buy milk', t0);
    await sync();
    remote.edit('phone', (data) => {
      data.tasks.push({ ...data.tasks[0], id: 'p', text: 'call mum' });
    });

    expect(await sync()).toBe(true); // so this device's file has it too
    expect(remote.texts()).toEqual(['buy milk', 'call mum']);
    expect(await sync()).toBe(false);
  });

  it('keeps an edit here and a move on another device', async () => {
    const id = (await addTask('buy milk', t0))!;
    await sync();

    remote.edit('phone', (data) => {
      const task = data.tasks[0];
      task.bucket = 'week';
      task.fieldUpdatedAt.bucket = later(2).toISOString();
    });
    await editText(id, 'buy oat milk', later(1));

    await sync();
    expect(await db.tasks.get(id)).toMatchObject({ text: 'buy oat milk', bucket: 'week' });
    expect(remote.data().tasks[0]).toMatchObject({ text: 'buy oat milk', bucket: 'week' });
  });

  it('keeps an edit made after syncing, even with this clock behind the other device', async () => {
    const id = (await addTask('buy milk', t0))!;
    await sync();

    remote.edit('phone', (data) => {
      const task = data.tasks[0];
      task.text = 'buy oat milk';
      task.fieldUpdatedAt.text = later(10).toISOString(); // its clock is 10 minutes ahead
    });
    await sync();
    await editText(id, 'buy soy milk', later(1));

    await sync();
    expect(remote.data().tasks[0].text).toBe('buy soy milk');
  });

  it('merges several devices at once', async () => {
    await addTask('buy milk', t0);
    await sync();
    remote.edit('phone', (data) => data.tasks.push({ ...data.tasks[0], id: 'p', text: 'call mum' }));
    remote.edit('tablet', (data) => data.tasks.push({ ...data.tasks[0], id: 't', text: 'pay rent' }));

    await sync();
    expect(await activeTexts()).toEqual(['buy milk', 'call mum', 'pay rent']);
    expect(remote.texts()).toEqual(['buy milk', 'call mum', 'pay rent']);
  });

  it('writes its file again if it was removed', async () => {
    await addTask('buy milk', t0);
    await sync();
    remote.files.delete('here');

    expect(await sync({ tidy: true })).toBe(true);
    expect(remote.texts()).toEqual(['buy milk']);
  });

  it('drops tasks deleted or completed over 90 days ago, here and in its file', async () => {
    const old = (await addTask('old', daysAgo(200)))!;
    const recent = (await addTask('recent', daysAgo(200)))!;
    const done = (await addTask('done', daysAgo(200)))!;
    const longDone = (await addTask('long done', daysAgo(200)))!;
    await deleteTask(recent, daysAgo(89));
    await completeTask(done, daysAgo(89));
    await completeTask(longDone, daysAgo(150));
    await sync();

    // Another device deleted it long ago
    remote.edit('phone', (data) => {
      const task = data.tasks.find((t) => t.id === old)!;
      task.deletedAt = task.fieldUpdatedAt.deletedAt = daysAgo(91).toISOString();
    });

    expect(await sync()).toBe(true);
    const ids = (tasks: { id: string }[]) => tasks.map((t) => t.id).sort();
    expect(ids(await db.tasks.toArray())).toEqual([recent, done].sort());
    expect(ids(remote.data().tasks)).toEqual([recent, done].sort());
  });

  describe('on a first sync, with demo tasks', () => {
    const first = () => sync({ dropMissing: startFrom(null, null).dropMissing });

    it('replaces them with the tasks of an account that has data', async () => {
      await addTask('buy milk', t0);
      await sync();
      remote.edit('phone', () => {});

      await db.tasks.clear(); // a new device, showing the demo
      state = { cursor: null, pushedKey: null };
      remote.files.delete('here');
      await addDemoTasks(t0);
      await first();
      expect(await activeTexts()).toEqual(['buy milk']);
    });

    it('pushes them to a new account', async () => {
      await addDemoTasks(t0);
      expect(await first()).toBe(true);
      expect(remote.data().tasks.filter(isDemoTask)).toHaveLength(4);
    });

    it('keeps tasks the user added or retyped', async () => {
      remote.write('phone', emptyFile()); // every task long deleted
      await addDemoTasks(t0);
      const [retyped] = await db.tasks.toArray();
      await editText(retyped.id, 'call mum', later(1));
      await addTask('pay rent', later(2));

      expect(await first()).toBe(true);
      expect(remote.texts()).toEqual(['call mum', 'pay rent']);
    });

    it('keeps the ones the account has, with what was done to them here', async () => {
      await addDemoTasks(t0);
      await sync();
      remote.edit('phone', () => {});
      remote.files.delete('here');
      state = { cursor: null, pushedKey: null };
      const [done] = await db.tasks.toArray();
      await completeTask(done.id, later(1));

      expect(await first()).toBe(true);
      expect(remote.data().tasks.filter(isDemoTask)).toHaveLength(4);
      expect(remote.data().tasks.find((t) => t.id === done.id)!.completedAt).not.toBeNull();
    });
  });

  describe('coming back after more than 90 days away', () => {
    const lastSynced = daysAgo(120);
    const comeBack = () => {
      const plan = startFrom(lastSynced.toISOString(), state.cursor);
      state = { ...state, cursor: plan.cursor };
      return sync({ dropMissing: plan.dropMissing });
    };
    const ids = async () => (await db.tasks.toArray()).map((t: Task) => t.text).sort();

    beforeEach(async () => {
      await addTask('gone elsewhere', daysAgo(200)); // since deleted, then dropped, elsewhere
      await addTask('kept elsewhere', daysAgo(200));
      await sync();
    });

    it('drops tasks the other devices have since dropped, and keeps new ones', async () => {
      remote.edit('phone', (data) => {
        data.tasks = data.tasks.filter((t) => t.text !== 'gone elsewhere');
      });
      await addTask('added while away', daysAgo(10));

      await comeBack();
      expect(await ids()).toEqual(['added while away', 'kept elsewhere']);
      expect(remote.texts()).toEqual(['added while away', 'kept elsewhere']);
    });

    it('keeps everything when no other device has a file', async () => {
      await comeBack();
      expect(await ids()).toEqual(['gone elsewhere', 'kept elsewhere']);
    });

    it("keeps tasks missing only from files older than this device's last sync", async () => {
      // The phone last wrote before this device's last sync, so never had the newest task
      remote.edit('phone', (data) => {
        data.tasks = data.tasks.filter((t) => t.text !== 'gone elsewhere');
      }, daysAgo(121));
      await addTask('added before going', daysAgo(120));

      await comeBack();
      expect(await ids()).toEqual(['added before going', 'gone elsewhere', 'kept elsewhere']);
    });

    it("doesn't apply after a shorter time away", async () => {
      remote.edit('phone', (data) => {
        data.tasks = data.tasks.filter((t) => t.text !== 'gone elsewhere');
      });
      const plan = startFrom(daysAgo(30).toISOString(), state.cursor);
      expect(plan).toEqual({ cursor: state.cursor });
      state = { ...state, cursor: null }; // even reading every file
      await sync({ dropMissing: plan.dropMissing });
      expect(await ids()).toEqual(['gone elsewhere', 'kept elsewhere']);
    });
  });

  it("clears out a device's stale file before a new device reads it", async () => {
    await addTask('done long ago', daysAgo(300));
    await sync();
    remote.edit('drawer', () => {}, daysAgo(150)); // not used since, so never heard it was done
    remote.write('phone', emptyFile()); // done, then dropped, long ago
    await db.tasks.clear(); // a new device
    remote.files.delete('here');
    state = { cursor: null, pushedKey: null };

    await sync({ tidy: true, dropMissing: startFrom(null, null).dropMissing });
    expect(remote.files.has('drawer')).toBe(false);
    expect(await db.tasks.count()).toBe(0);
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
