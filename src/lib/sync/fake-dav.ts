// For tests only: an in-memory WebDAV server, and dates to set its files' ages by.

export const DAY = 86_400_000;
const T = Date.parse('2026-10-29T12:00:00Z');
export const at = (daysAgo: number) => new Date(T - daysAgo * DAY).toUTCString();

export const ROOT = 'https://cloud.example.com/remote.php/dav/files/me/';

/**
 * Just enough of a WebDAV server, for the calls WebDavBackend makes, in memory: the app's
 * folder and its files. Replies vary the way real servers do: namespace prefixes, full or
 * path-only hrefs, ETags or none.
 */
export class FakeDav {
  folder = false; // whether the app's folder exists
  files = new Map<string, { content: string; modified: string; etag: number }>();
  calls: string[] = [];
  nextEtag = 1;
  prefix = 'd';
  fullHrefs = false;
  etags = true;
  failWith: number | 'offline' | 'stall' | null = null;
  failDelete: number | null = null; // e.g. 423: the file is locked
  private folderPath: string;
  private held: { arrived: () => void; released: Promise<void> } | null = null;

  constructor(
    public root = ROOT,
    public username = 'me',
    public password = 'secret',
  ) {
    this.folderPath = new URL('dumb-tasks/', root).pathname;
  }

  add(name: string, content: string, modified = at(0)) {
    this.folder = true;
    this.files.set(name, { content, modified, etag: this.nextEtag++ });
  }

  /** Holds back every reply until release(). `arrived` settles once a request is waiting. */
  hold(): { arrived: Promise<void>; release: () => void } {
    let arrived!: () => void;
    let release!: () => void;
    const hasArrived = new Promise<void>((resolve) => (arrived = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.held = { arrived, released };
    return {
      arrived: hasArrived,
      release: () => {
        this.held = null;
        release();
      },
    };
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const folder = this.folderPath;
    this.calls.push(`${method} ${url.pathname.replace(folder, '')}`);
    const held = this.held;
    if (held) {
      held.arrived();
      await held.released;
    }
    if (this.failWith === 'offline') throw new TypeError('Failed to fetch');
    if (this.failWith === 'stall') {
      return new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)));
    }
    if (this.failWith) return new Response(null, { status: this.failWith });
    const status = (code: number) => new Response(null, { status: code });
    const auth = `Basic ${btoa(`${this.username}:${this.password}`)}`;
    if (new Headers(init.headers).get('Authorization') !== auth) return status(401);

    if (method === 'PROPFIND') {
      const depth = new Headers(init.headers).get('Depth');
      if (`${url.origin}${url.pathname}` === this.root) return this.multistatus([this.entry(url.pathname)]);
      if (url.pathname !== folder) return status(404);
      if (!this.folder) return status(404);
      const children = depth === '1' ? [...this.files.keys()].map((n) => this.entry(folder + n, n)) : [];
      return this.multistatus([this.entry(folder), ...children]);
    }
    if (method === 'MKCOL') {
      if (this.folder) return status(405);
      this.folder = true;
      return status(201);
    }
    const name = url.pathname.startsWith(folder) ? url.pathname.slice(folder.length) : null;
    if (!name) throw new Error(`Unexpected ${method} ${url}`);
    if (method === 'PUT') {
      if (!this.folder) return status(409);
      const existed = this.files.has(name);
      this.add(name, String(init.body));
      return status(existed ? 204 : 201);
    }
    const file = this.files.get(name);
    if (!file) return status(404);
    if (method === 'GET') return new Response(file.content);
    if (method === 'DELETE') {
      if (this.failDelete) return status(this.failDelete);
      this.files.delete(name);
      return status(204);
    }
    throw new Error(`Unexpected ${method} ${url}`);
  };

  private entry(path: string, name?: string): string {
    const d = this.prefix;
    const file = name ? this.files.get(name) : undefined;
    const href = (this.fullHrefs ? new URL(this.root).origin : '') + path;
    const props = file
      ? `<${d}:getlastmodified>${file.modified}</${d}:getlastmodified>` +
        (this.etags ? `<${d}:getetag>"${file.etag}"</${d}:getetag>` : '')
      : '';
    return `<${d}:response><${d}:href>${href}</${d}:href><${d}:propstat><${d}:prop>${props}</${d}:prop>
      <${d}:status>HTTP/1.1 200 OK</${d}:status></${d}:propstat></${d}:response>`;
  }

  private multistatus(responses: string[]): Response {
    const d = this.prefix;
    const xml = `<?xml version="1.0"?><${d}:multistatus xmlns:${d}="DAV:">${responses.join('')}</${d}:multistatus>`;
    return new Response(xml, { status: 207, headers: { 'Content-Type': 'application/xml' } });
  }

  names(): string[] {
    return [...this.files.keys()].sort();
  }
}

/** A fetch that sends each request to the server whose folder it's in. */
export function serve(...servers: FakeDav[]): typeof fetch {
  return (input, init) => {
    const server = servers.find((s) => String(input).startsWith(s.root));
    if (!server) return Promise.reject(new TypeError(`No server at ${input}`)); // as fetch does
    return server.fetch(input, init);
  };
}
