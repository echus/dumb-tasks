import { Gate, type FakeServer } from './fake-server';

// An in-memory Google Drive, and dates to set its files' ages by.

export const DAY = 86_400_000;
const T = Date.parse('2026-10-29T12:00:00Z');
export const at = (daysAgo: number) => new Date(T - daysAgo * DAY).toISOString();

/**
 * Just enough of Drive's REST API, for the calls DriveBackend makes, in memory: the app
 * folder's files and its change log. Change pages are kept small so tests reach paging.
 */
export class FakeDrive implements FakeServer {
  root = 'https://www.googleapis.com/';
  files = new Map<string, { name: string; content: string; modifiedTime: string }>();
  log: string[] = []; // file ids, in the order they changed; a page token is an index here
  calls: string[] = [];
  pageSize = 2;
  nextId = 1;
  failWith: number | 'offline' | null = null;
  // The tokens it takes, and whose they are. Null: any token, for the one account
  tokens: Map<string, { email: string; expiresAt: number }> | null = null;
  gate = new Gate();

  add(name: string, content: string, modifiedTime = at(0)): string {
    const id = `id${this.nextId++}`;
    this.files.set(id, { name, content, modifiedTime });
    this.log.push(id);
    return id;
  }

  remove(id: string) {
    this.files.delete(id);
    this.log.push(id);
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    this.calls.push(`${method} ${url.pathname.replace(/^\/(upload\/)?drive\/v3/, '')}`);
    await this.gate.pass();
    if (this.failWith === 'offline') throw new TypeError('Failed to fetch');
    if (this.failWith) return new Response(null, { status: this.failWith });
    const bearer = new Headers(init.headers).get('Authorization')?.replace(/^Bearer /, '') ?? '';
    const token = this.tokens?.get(bearer);
    if (this.tokens && !(token && token.expiresAt > Date.now())) return new Response(null, { status: 401 });
    const id = url.pathname.match(/\/files\/([^/]+)$/)?.[1];
    const json = (body: unknown) => Response.json(body);
    const missing = new Response(null, { status: 404 });

    if (url.pathname.endsWith('/about')) {
      return json({ user: { emailAddress: token?.email ?? 'me@example.com' } });
    }
    if (url.pathname.endsWith('/changes/startPageToken')) {
      return json({ startPageToken: String(this.log.length) });
    }
    if (url.pathname.endsWith('/changes')) {
      const from = Number(url.searchParams.get('pageToken'));
      const page = this.log.slice(from, from + this.pageSize);
      const changes = page.map((fileId) => {
        const file = this.files.get(fileId);
        if (!file) return { fileId, removed: true };
        return { fileId, removed: false, file: { ...file, trashed: false } };
      });
      const end = from + page.length;
      return json(
        end < this.log.length
          ? { changes, nextPageToken: String(end) }
          : { changes, newStartPageToken: String(end) },
      );
    }
    if (method === 'GET' && url.pathname.endsWith('/files')) {
      const files = [...this.files].map(([id, f]) => ({ id, name: f.name, modifiedTime: f.modifiedTime }));
      return json({ files });
    }
    if (method === 'GET' && id) {
      const file = this.files.get(id);
      return file ? new Response(file.content) : missing;
    }
    if (method === 'PATCH' && id) {
      const file = this.files.get(id);
      if (!file) return missing;
      file.content = await (init.body as Blob).text();
      file.modifiedTime = at(0);
      this.log.push(id);
      return json({ id });
    }
    if (method === 'POST') {
      const form = init.body as FormData;
      const metadata = JSON.parse(await (form.get('metadata') as Blob).text());
      if (metadata.parents?.[0] !== 'appDataFolder') throw new Error('Not in the app folder');
      return json({ id: this.add(metadata.name, await (form.get('file') as Blob).text()) });
    }
    if (method === 'DELETE' && id) {
      if (!this.files.has(id)) return missing;
      this.remove(id);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };

  contents(name: string): string | undefined {
    return [...this.files.values()].find((f) => f.name === name)?.content;
  }

  names(): string[] {
    return [...this.files.values()].map((f) => f.name).sort();
  }
}
