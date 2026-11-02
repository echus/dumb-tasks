// What a build of the app comes with, set when it's built (.env.local, or the build's own
// variables): see the README.

/** The app's Google sign-in client. Set in .env.local; without it the app works as before. */
export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined;

/** Whether this build syncs with Google Drive. Self-hosted builds sync with WebDAV only. */
export const DRIVE_AVAILABLE = Boolean(GOOGLE_CLIENT_ID);
