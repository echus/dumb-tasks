// Google's sign-in popup and the Worker behind it (src/lib/sync/google-auth.ts), faked: who
// is signed in to Google in this browser, and whether the Worker still holds a sign-in to
// hand out new tokens with. A test file puts it in place of google-auth.ts with
//
//   vi.mock('<path to src>/lib/sync/google-auth', () => google.module);
//   const google = fakeGoogle();
//
// which works as long as nothing the file imports up front loads google-auth.ts.

export function fakeGoogle() {
  const fresh = () => ({
    clientId: undefined as string | undefined, // undefined: a build without Drive
    account: 'me@example.com',
    quietSignIn: true, // a sign-in with the account named closes on its own
    workerSignedIn: false,
    tokens: new Map<string, { email: string; expiresAt: number }>(), // the ones Drive takes
    issued: 0,
    signIns: [] as (string | undefined)[], // the account named, if any, for each
    refreshes: 0,
    signOuts: 0,
  });
  const google = fresh();

  const token = () => {
    const value = `token${++google.issued}`;
    const expiresAt = Date.now() + 3_600_000;
    google.tokens.set(value, { email: google.account, expiresAt });
    return { value, expiresAt, remembered: true };
  };

  const module = {
    get CLIENT_ID() {
      return google.clientId;
    },
    loadGoogle: async () => ({}),
    signIn: async (loginHint?: string) => {
      google.signIns.push(loginHint);
      if (loginHint && !google.quietSignIn) throw new Error('Cannot open the Google sign-in.');
      google.workerSignedIn = true;
      return token();
    },
    refreshToken: async () => {
      google.refreshes++;
      return google.workerSignedIn ? token() : null;
    },
    signOut: async () => {
      google.signOuts++;
      google.workerSignedIn = false;
    },
  };

  return Object.assign(google, { module, reset: () => Object.assign(google, fresh()) });
}
