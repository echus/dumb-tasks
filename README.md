# Dumb Tasks

A deliberately simple, local-first task list. Brain-dump one-line tasks, then sort them into
**Today**, **Week**, **Month** or **Later**. See [SPEC.md](SPEC.md) for the full design.

Everything is stored in your browser (IndexedDB). There's no account and no server. Optionally,
tasks sync between devices through a hidden folder in your Google Drive.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run check    # type-check
npm run build    # production build in dist/
```

### Google Drive sync

Sync needs a Google OAuth client ID; without one the app works as before, with sync shown as
not set up.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable
   the **Google Drive API**.
2. Set up the OAuth consent screen (External; add yourself as a test user) with the
   `.../auth/drive.appdata` scope.
3. Create an **OAuth client ID** of type *Web application*. Add `http://localhost:5173`, and
   any origin you deploy to, under *Authorized JavaScript origins*. No redirect URIs needed.
4. Copy `.env.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID`.

### Deploying

The app is plain static files, served by a Cloudflare Worker (`wrangler.jsonc`). In
Cloudflare: Workers & Pages → Create → Import a repository, build command `npm run build`,
and `VITE_GOOGLE_CLIENT_ID` as a **build** variable. Add the Worker's address (or custom
domain) to the OAuth client's Authorized JavaScript origins. Every push to `main` deploys.

The service worker only runs in production builds; use `npm run build && npm run preview`
to test offline behaviour.

## Layout

- `src/lib/types.ts`: the data model (`Task`, `DataFile`)
- `src/lib/db.ts`: IndexedDB tables
- `src/lib/tasks.ts`: every task operation (add, move, complete, edit, delete)
- `src/lib/history.svelte.ts`: undo / redo
- `src/lib/merge.ts`: per-field merge for backup import and sync
- `src/lib/data-file.ts`: JSON export / import
- `src/lib/sync.ts`: pull, merge, push against any `SyncBackend`
- `src/lib/drive.ts`, `src/lib/google-auth.ts`: the Google Drive backend and sign-in
- `src/lib/sync-state.svelte.ts`: when to sync, and the state the sync menu shows
- `src/lib/deadline.ts`: finds deadlines in task text ("by friday", "14 nov")
- `src/lib/guess-icon.ts`: picks an icon from keywords
- `src/lib/task-icons.ts`: the fallback emoji, and each task's circle colour
- `src/lib/dnd.ts`: where dragged tasks land; long-press touch dragging
- `src/lib/theme.svelte.ts`: light/dark toggle (follows the system until used)
- `src/lib/startup.ts`: Android share target, persistent storage
- `src/components/`: the UI (Svelte 5)
