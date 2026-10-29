// Google sign-in for Drive sync. Google's popup signs the user in and hands back a one-time
// code; the Worker (worker/index.ts) swaps it for a refresh token, kept in a cookie this page
// can't read. From then on the Worker hands out fresh hour-long access tokens on request, with
// no popup, until the user disconnects or removes the app's access in their Google account.

// Only the app's own hidden folder in Drive, never the rest of the user's files.
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Set in .env.local; without it the app works as before, with sync unavailable. */
export const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export interface AccessToken {
  value: string;
  expiresAt: number; // ms since epoch
  remembered?: boolean; // the Worker kept a refresh token, so this device stays signed in
}

interface CodeResponse {
  code: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface Gis {
  accounts: {
    oauth2: {
      initCodeClient(config: {
        client_id: string;
        scope: string;
        ux_mode: 'popup';
        login_hint?: string;
        callback: (r: CodeResponse) => void;
        error_callback: (e: { type: string }) => void;
      }): { requestCode(): void };
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

let loading: Promise<Gis> | null = null;

/**
 * Loads Google's script. Called ahead of time (e.g. when the sync menu opens) so the popup
 * can open straight from the click; browsers block popups that open too long after one.
 */
export function loadGoogle(): Promise<Gis> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve(window.google!);
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Couldn't reach Google."));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Signs in with Google's popup, so call it from a click. With `loginHint` (an account that
 * already said yes) the popup closes on its own.
 */
export async function signIn(loginHint?: string): Promise<AccessToken> {
  const google = await loadGoogle();
  const code = await new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initCodeClient({
      client_id: CLIENT_ID!,
      scope: SCOPE,
      ux_mode: 'popup',
      login_hint: loginHint,
      callback: (r) => {
        if (r.error) reject(new Error(r.error_description ?? r.error));
        // The consent screen lets people untick Drive access.
        else if (!r.scope.split(' ').includes(SCOPE)) {
          reject(new Error('Dumb Tasks needs access to Google Drive to sync.'));
        } else resolve(r.code);
      },
      error_callback: (e) =>
        reject(
          new Error(
            e.type === 'popup_closed' ? 'Sign-in was cancelled.' : "Couldn't open Google sign-in.",
          ),
        ),
    });
    client.requestCode();
  });
  const token = await callWorker('/auth/exchange', { code });
  if (!token) throw new Error("Google didn't accept the sign-in.");
  if (!token.remembered) console.warn('No refresh token from Google: this sign-in lasts an hour.');
  return token;
}

/** A fresh access token, no popup needed. Null when the user has to sign in again. */
export function refreshToken(): Promise<AccessToken | null> {
  return callWorker('/auth/token');
}

/** Forgets the sign-in on this device. Other devices stay signed in. */
export async function signOut(): Promise<void> {
  await fetch('/auth/signout', { method: 'POST' });
}

async function callWorker(path: string, body?: object): Promise<AccessToken | null> {
  const unreachable = new Error("Couldn't reach Google. Will try again.");
  const res = await fetch(path, {
    method: 'POST',
    headers: body && { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  }).catch(() => {
    throw unreachable;
  });
  if (res.status === 400 || res.status === 401) return null;
  if (res.status === 501) throw new Error("Sync isn't fully set up on the server.");
  if (!res.ok) throw unreachable;
  const { value, expiresIn, remembered } = await res.json();
  return { value, expiresAt: Date.now() + expiresIn * 1000, remembered };
}
