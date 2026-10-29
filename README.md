# Dumb Tasks

A really simple, local-first, open source task list with optional sync to your own Google Drive.

Live at [dumbtasks.app](https://dumbtasks.app).

## Development

```bash
npm install
npm run dev      # http://localhost:5173, with the sign-in Worker
npm test
npm run check    # type-check
npm run build
```

The service worker only runs in production builds (`npm run build && npm run preview`).

### Google Drive sync

Optional; without credentials the app runs with sync shown as not set up. Create a Google
Cloud OAuth client (*Web application*) with the Drive API enabled and the `drive.appdata`
scope, and add your origins to its JavaScript origins. Then set `VITE_GOOGLE_CLIENT_ID` in
`.env.local` and `GOOGLE_CLIENT_SECRET` in `.dev.vars` (see the `.example` files). The secret
stays in the sign-in Worker (`worker/index.ts`), which keeps people signed in.

### Deploying

A Cloudflare Worker serves the app and the sign-in helper (`wrangler.jsonc`); every push to
`main` deploys via Workers Builds. Set `VITE_GOOGLE_CLIENT_ID` as a build variable and
`GOOGLE_CLIENT_SECRET` as a secret.

## Layout

- `src/lib/types.ts`: the data model (`Task`, `DataFile`)
- `src/lib/db.ts`: IndexedDB tables
- `src/lib/startup.ts`: Android share target, persistent storage
- `src/lib/tasks/`: the task list itself
  - `tasks.ts`: every task operation (add, move, complete, edit, delete)
  - `demo-tasks.ts`: the tasks shown on a first visit
  - `history.svelte.ts`: undo / redo
  - `deadline.ts`: finds deadlines in task text ("by friday", "14 nov")
  - `guess-icon.ts`: picks an icon from keywords
  - `circle-colours.ts`: the fallback emoji, and each task's circle colour
  - `recolour.ts`: brings older tasks up to the current icon and colour rules
- `src/lib/sync/`: backup and Google Drive sync
  - `merge.ts`: per-field merge for backup import and sync
  - `data-file.ts`: JSON export / import
  - `engine.ts`: pull, merge, push against any `SyncBackend`
  - `local-changes.ts`: tells sync a task was written
  - `drive.ts`, `google-auth.ts`: the Google Drive backend and sign-in
  - `drive-sync.svelte.ts`: when to sync, and the state the sync menu shows
- `src/lib/ui/`: drag and drop (`dnd.ts`), shared UI state, theme, icons
- `src/components/`: the UI (Svelte 5)
- `worker/index.ts`: the sign-in Worker, which keeps people signed in to Drive

## License

Copyright © 2026 Varvara Efremova, under the [AGPL-3.0](LICENSE). The name "Dumb Tasks" and
the app icon aren't covered by the license; please use your own for a fork.
