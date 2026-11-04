// The app's only server code: keeps people signed in to Google Drive. Google gives a browser
// only hour-long tokens; a refresh token, which lasts until it's revoked, needs the client
// secret, which can't live in the page. So the page sends the one-time code from Google's
// sign-in popup here, the refresh token goes into a cookie the page can't read, and the page
// asks here for a new access token whenever its last one runs out. No tasks pass through.
// Everything outside /auth/ is the static app, served straight from the assets.

interface Env {
  ASSETS: Fetcher;
  GOOGLE_CLIENT_SECRET: string;
}

interface GoogleTokens {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

interface GoogleError {
  error: string;
  error_description?: string;
}

const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const COOKIE = '__Host-drive_session';
const PLAIN_COOKIE = 'drive_session'; // over http (see cookie)
const COOKIE_DAYS = 400; // the longest browsers keep a cookie; Google drops unused tokens sooner

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/auth/')) return env.ASSETS.fetch(request);
    // Only the app's own pages may call these. Hosts, not origins: through a tunnel to a local
    // preview the page is https but the Worker sees http.
    const origin = request.headers.get('Origin');
    if (request.method !== 'POST' || !origin || new URL(origin).host !== url.host) {
      return new Response('Forbidden', { status: 403 });
    }
    const res = await auth(request, env, url);
    // Tokens: never to be kept by the browser or anything on the way
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Pragma', 'no-cache');
    return res;
  },
} satisfies ExportedHandler<Env>;

async function auth(request: Request, env: Env, url: URL): Promise<Response> {
  if (!CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response('Sync is not set up', { status: 501 });
  switch (url.pathname) {
    case '/auth/exchange':
      return exchange(request, env, url);
    case '/auth/token':
      return refresh(request, env, url);
    case '/auth/signout':
      return new Response(null, { status: 204, headers: setCookie(request, url, '', 0) });
  }
  return new Response('Not found', { status: 404 });
}

/** After the sign-in popup: swaps its code for tokens and remembers the refresh token. */
async function exchange(request: Request, env: Env, url: URL): Promise<Response> {
  const { code } = await request.json<{ code?: string }>().catch(() => ({ code: undefined }));
  if (!code) return new Response('Missing code', { status: 400 });
  const res = await google(env, { grant_type: 'authorization_code', code, redirect_uri: 'postmessage' });
  if (!res.ok) {
    await logError('exchange', res);
    return new Response("Google didn't accept the sign-in.", { status: res.status === 400 ? 400 : 502 });
  }
  const tokens = await res.json<GoogleTokens>();
  // Google may send a refresh token only the first time an account says yes. Without one the
  // access token still works for its hour, and any cookie from before stays as it is.
  const headers = tokens.refresh_token ? setCookie(request, url, tokens.refresh_token, COOKIE_DAYS) : undefined;
  return accessToken(tokens, headers);
}

/** A fresh access token from the remembered refresh token. 401: sign in again. */
async function refresh(request: Request, env: Env, url: URL): Promise<Response> {
  const refreshToken = session(request, url);
  if (!refreshToken) return new Response('Signed out', { status: 401 });
  const res = await google(env, { grant_type: 'refresh_token', refresh_token: refreshToken });
  if (!res.ok) {
    // invalid_grant: revoked, or expired (after a week while the app is in Google's testing
    // mode). Anything else, like a wrong client secret, isn't the user's to fix by signing in.
    if ((await logError('refresh', res))?.error === 'invalid_grant') {
      return new Response('Signed out', { status: 401, headers: setCookie(request, url, '', 0) });
    }
    return new Response("Couldn't reach Google.", { status: 502 });
  }
  // Set again to restart the cookie's clock, so it lasts as long as the app is used.
  return accessToken(await res.json<GoogleTokens>(), setCookie(request, url, refreshToken, COOKIE_DAYS));
}

function google(env: Env, params: Record<string, string>): Promise<Response> {
  return fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
  });
}

/** Shows in the Worker's logs (`wrangler tail`), e.g. a wrong secret or redirect URI. */
async function logError(step: string, res: Response): Promise<GoogleError | undefined> {
  const body = await res.json<GoogleError>().catch(() => undefined);
  console.error(`Google ${step} failed: ${res.status}`, body?.error, body?.error_description);
  return body;
}

function accessToken(tokens: GoogleTokens, headers?: Headers): Response {
  const remembered = Boolean(headers);
  return Response.json({ value: tokens.access_token, expiresIn: tokens.expires_in, remembered }, { headers });
}

// Holds the refresh token as is: it's useless without the client secret, which only this
// Worker has, and HttpOnly keeps it out of reach of the page's scripts. Over https it's a
// __Host- cookie: a page on another subdomain can't set one by that name, so it can't put a
// sign-in of its own in place of this one. That needs Secure and Path=/, and Safari won't keep
// a Secure cookie from http://localhost, so there it's a plain one.
function cookie(url: URL, value: string, days: number): string {
  const rest = `Max-Age=${days * 86400}; HttpOnly; SameSite=Strict`;
  return url.protocol === 'https:'
    ? `${COOKIE}=${value}; Path=/; ${rest}; Secure`
    : `${PLAIN_COOKIE}=${value}; Path=/auth/; ${rest}`;
}

/**
 * Sets the sign-in cookie (to clear it: no value, 0 days). Over https, also clears a plain one
 * from before __Host-, which no longer counts: that device signs in again, and this drops the
 * old token.
 */
function setCookie(request: Request, url: URL, value: string, days: number): Headers {
  const headers = new Headers({ 'Set-Cookie': cookie(url, value, days) });
  if (url.protocol === 'https:' && readCookie(request, PLAIN_COOKIE) !== undefined) {
    headers.append('Set-Cookie', `${PLAIN_COOKIE}=; Path=/auth/; Max-Age=0; HttpOnly; SameSite=Strict; Secure`);
  }
  return headers;
}

/** The refresh token. */
function session(request: Request, url: URL): string | undefined {
  return readCookie(request, url.protocol === 'https:' ? COOKIE : PLAIN_COOKIE);
}

function readCookie(request: Request, cookie: string): string | undefined {
  for (const part of request.headers.get('Cookie')?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookie) return value.join('=') || undefined;
  }
}
