// Google sign-in for Drive sync, straight from the browser with Google Identity Services.
// With no server there are no refresh tokens: a token lasts about an hour, and getting a new
// one opens a (usually instant) popup, so it has to start from a click.

// Only the app's own hidden folder in Drive, never the rest of the user's files.
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

/** Set in .env.local; without it the app works as before, with sync unavailable. */
export const CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

export interface AccessToken {
  value: string;
  expiresAt: number; // ms since epoch
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        login_hint?: string;
        callback: (r: TokenResponse) => void;
        error_callback: (e: { type: string }) => void;
      }): { requestAccessToken(overrides?: { prompt?: string }): void };
      hasGrantedAllScopes(r: TokenResponse, scope: string): boolean;
      revoke(token: string, done?: () => void): void;
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
 * Asks Google for a Drive token. Call it from a click: it opens a popup. With `loginHint`
 * (an account that already said yes) the popup closes on its own.
 */
export async function requestToken(loginHint?: string): Promise<AccessToken> {
  const google = await loadGoogle();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID!,
      scope: SCOPE,
      login_hint: loginHint,
      callback: (r) => {
        if (r.error) reject(new Error(r.error_description ?? r.error));
        // The consent screen lets people untick Drive access.
        else if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
          reject(new Error('Dumb Tasks needs access to Google Drive to sync.'));
        } else resolve({ value: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 });
      },
      error_callback: (e) =>
        reject(
          new Error(
            e.type === 'popup_closed' ? 'Sign-in was cancelled.' : "Couldn't open Google sign-in.",
          ),
        ),
    });
    client.requestAccessToken(loginHint ? { prompt: '' } : undefined);
  });
}

export async function revokeToken(token: string): Promise<void> {
  const google = await loadGoogle();
  await new Promise<void>((resolve) => google.accounts.oauth2.revoke(token, resolve));
}
