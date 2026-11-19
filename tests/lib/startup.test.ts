// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://dumbtasks.app/"}
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '$lib/db';
import { handleShareTarget } from '$lib/startup';

/** The app opened at this address, installed or in a browser tab. */
function open(search: string, installed: boolean) {
  history.replaceState(null, '', `/${search}`);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: installed && query === '(display-mode: standalone)' }));
}

const texts = async () => (await db.tasks.toArray()).map((t) => t.text);

beforeEach(() => db.tasks.clear());
afterEach(() => vi.unstubAllGlobals());

describe('handleShareTarget', () => {
  it('adds text shared to the installed app to Today, once', async () => {
    open('?title=Article&text=Read%20this&url=https%3A%2F%2Fexample.com', true);
    await handleShareTarget();
    const [task] = await db.tasks.toArray();
    expect(task.text).toBe('Article Read this https://example.com');
    expect(task.bucket).toBe('today');
    expect(location.search).toBe('');

    await handleShareTarget(); // as after a reload
    expect(await texts()).toHaveLength(1);
  });

  it('skips a URL the shared text already has in it', async () => {
    open('?text=Read%20https%3A%2F%2Fexample.com&url=https%3A%2F%2Fexample.com', true);
    await handleShareTarget();
    expect(await texts()).toEqual(['Read https://example.com']);
  });

  it('adds nothing from a link opened in a browser tab, and drops the params', async () => {
    open('?text=Call%20your%20bank%20on%20this%20number', false);
    await handleShareTarget();
    expect(await texts()).toEqual([]);
    expect(location.search).toBe('');
  });
});
