import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Worker run as is, in Node: requests in, responses out. Google's token endpoint is faked.

type Worker = typeof import('./index').default;

const APP = 'https://dumbtasks.app';

let worker: Worker;
let assets: ReturnType<typeof vi.fn>;
let sentToGoogle: URLSearchParams[];
let googleReplies: Response;

const env = (secret = 'client-secret') => ({
  ASSETS: { fetch: assets } as unknown as Fetcher,
  GOOGLE_CLIENT_SECRET: secret,
});

/** The Worker, as built with this client id (read once, when it loads). */
async function load(clientId = 'client-id') {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', clientId);
  vi.resetModules();
  worker = (await import('./index')).default;
}

/** Sends the Worker a request, as Cloudflare would (without what it adds about the visitor). */
function send(request: Request, environment = env()): Promise<Response> {
  return worker.fetch(request as Parameters<Worker['fetch']>[0], environment);
}

/** A POST to /auth/, from the app's own page unless said otherwise. */
function auth(path: string, { body, cookie, origin = APP, app = APP }: Partial<Record<string, string>> = {}) {
  const headers: Record<string, string> = {};
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  return new Request(`${app}/auth/${path}`, { method: 'POST', headers, body });
}

const tokens = (refresh?: string) =>
  Response.json({ access_token: 'access', expires_in: 3599, ...(refresh && { refresh_token: refresh }) });

beforeEach(async () => {
  assets = vi.fn(async () => new Response('the app'));
  sentToGoogle = [];
  googleReplies = tokens();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      sentToGoogle.push(new URLSearchParams(String(init.body)));
      return googleReplies;
    }),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {}); // Google's errors, logged
  await load();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the Worker', () => {
  it('serves everything outside /auth/ from the app', async () => {
    const res = await send(new Request(`${APP}/today`));
    expect(await res.text()).toBe('the app');
  });

  it("refuses /auth/ requests that aren't a POST from the app's own page", async () => {
    for (const request of [
      auth('token', { origin: '' }),
      auth('token', { origin: 'https://elsewhere.example' }),
      new Request(`${APP}/auth/token`, { headers: { Origin: APP } }),
    ]) {
      expect((await send(request)).status).toBe(403);
    }
    expect(sentToGoogle).toEqual([]);
  });

  it('says sync is not set up without a client id or secret', async () => {
    expect((await send(auth('token'), env(''))).status).toBe(501);
    await load('');
    expect((await send(auth('token'))).status).toBe(501);
  });

  it('knows no other /auth/ address', async () => {
    expect((await send(auth('elsewhere'))).status).toBe(404);
  });
});

describe('/auth/exchange', () => {
  const exchange = (code?: string) => auth('exchange', { body: JSON.stringify({ code }) });

  it('swaps the sign-in code for a token, and keeps the refresh token in a cookie', async () => {
    googleReplies = tokens('refresh');
    const res = await send(exchange('code'));
    expect(await res.json()).toEqual({ value: 'access', expiresIn: 3599, remembered: true });
    expect(res.headers.get('Set-Cookie')).toBe(
      'drive_session=refresh; Path=/auth/; Max-Age=34560000; HttpOnly; SameSite=Strict; Secure',
    );
    expect(Object.fromEntries(sentToGoogle[0])).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'authorization_code',
      code: 'code',
      redirect_uri: 'postmessage',
    });
  });

  it('leaves any cookie as it is when Google sends no refresh token', async () => {
    const res = await send(exchange('code'));
    expect(await res.json()).toMatchObject({ value: 'access', remembered: false });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('turns down a missing code without asking Google', async () => {
    expect((await send(exchange())).status).toBe(400);
    expect((await send(auth('exchange', { body: 'not json' }))).status).toBe(400);
    expect(sentToGoogle).toEqual([]);
  });

  it('says whether Google turned down the code, or failed', async () => {
    googleReplies = Response.json({ error: 'invalid_grant' }, { status: 400 });
    expect((await send(exchange('code'))).status).toBe(400);
    googleReplies = new Response(null, { status: 500 });
    expect((await send(exchange('code'))).status).toBe(502);
  });
});

describe('/auth/token', () => {
  it('signs out a device with no cookie, without asking Google', async () => {
    const res = await send(auth('token', { cookie: 'other=1' }));
    expect(res.status).toBe(401);
    expect(sentToGoogle).toEqual([]);
  });

  it('gets a new token with the refresh token, and keeps the cookie going', async () => {
    const res = await send(auth('token', { cookie: 'other=1; drive_session=refresh' }));
    expect(await res.json()).toEqual({ value: 'access', expiresIn: 3599, remembered: true });
    expect(res.headers.get('Set-Cookie')).toContain('drive_session=refresh; Path=/auth/; Max-Age=34560000');
    expect(Object.fromEntries(sentToGoogle[0])).toMatchObject({
      grant_type: 'refresh_token',
      refresh_token: 'refresh',
    });
  });

  it('signs out, and clears the cookie, once Google says the sign-in was revoked', async () => {
    googleReplies = Response.json({ error: 'invalid_grant' }, { status: 400 });
    const res = await send(auth('token', { cookie: 'drive_session=refresh' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('Set-Cookie')).toContain('drive_session=; Path=/auth/; Max-Age=0');
  });

  it("keeps the sign-in when Google fails for another reason, which isn't the user's to fix", async () => {
    googleReplies = Response.json({ error: 'invalid_client' }, { status: 401 });
    const res = await send(auth('token', { cookie: 'drive_session=refresh' }));
    expect(res.status).toBe(502);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('/auth/signout', () => {
  it('clears the cookie', async () => {
    const res = await send(auth('signout', { cookie: 'drive_session=refresh' }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Set-Cookie')).toContain('drive_session=; Path=/auth/; Max-Age=0');
  });
});

describe('the cookie', () => {
  it('is Secure only over https, as Safari drops Secure cookies from http://localhost', async () => {
    googleReplies = tokens('refresh');
    const local = 'http://localhost:5173';
    const res = await send(auth('exchange', { body: '{"code":"c"}', origin: local, app: local }));
    expect(res.headers.get('Set-Cookie')).not.toContain('Secure');
  });
});
