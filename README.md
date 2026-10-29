# Dumb Tasks

A really simple, local-first, open source task list with optional sync to your Google Drive or
WebDAV server.

Live at [dumbtasks.app](https://dumbtasks.app).

## WebDAV sync

To keep your tasks off anyone else's cloud, sync them through your WebDAV server, such as
Nextcloud or Apache. In the app, open the sync menu, choose *Connect WebDAV*, and enter the
folder's address (https), your username and, ideally, an app password. The app keeps one file
per device in a `dumb-tasks` folder there.

The browser talks to your server directly, so the server has to allow the app's origin (CORS):
the address you open the app at, scheme and host only, like `https://tasks.example.com`. Most
servers don't allow other origins by default.

**Nextcloud:** install the [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword)
app and add the app's origin to its WebDAV/CalDAV origins in its admin settings. The
folder's address is the WebDAV one under *Files settings* in the Files app, like
`https://cloud.example.com/remote.php/dav/files/you/`. Make an app password under *Personal
settings → Security*.

**Apache (`mod_dav`):** with `mod_headers` on, in the shared folder's `<Directory>`:

```apache
Dav On
AuthType Basic
AuthName "WebDAV"
AuthUserFile /path/to/htpasswd
# The browser's CORS check (OPTIONS) comes without the password
<LimitExcept OPTIONS>
    Require valid-user
</LimitExcept>
# "always", so a wrong password reaches the app as one, not as an unreachable server
Header always set Access-Control-Allow-Origin "https://tasks.example.com"
Header always set Access-Control-Allow-Methods "GET, PUT, DELETE, PROPFIND, MKCOL, OPTIONS"
Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth"
Header always set Access-Control-Max-Age "86400"
```

**Other servers** need the same: answer `OPTIONS` without a password, and send those headers
on every reply, errors included.

## Self-hosting with Docker

The Docker image serves the app with nginx. It syncs through WebDAV only: Google Drive sync
needs the sign-in Worker, which runs on Cloudflare, so it's turned off.

```bash
git clone https://github.com/echus/dumb-tasks.git
cd dumb-tasks
docker compose up -d --build
```

The app is then at `http://localhost:8080`. Put it behind your own reverse proxy with https:
browsers only let people install the app and use it offline over https (or on localhost). Then
allow its address in your WebDAV server, as above.

- **Version:** to show which commit is running in the sync menu, build with
  `COMMIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build`.
- **Privacy policy:** `public/privacy.html` describes the public instance. To serve your own,
  put it at `./privacy.html` and uncomment `volumes` in `docker-compose.yml`.
- **Updating:** `git pull`, then build again. Installed copies pick up the new version the next
  time they're opened.

Without Docker, `npm run build` (with no `VITE_GOOGLE_CLIENT_ID` set) and serve `dist/client`
from any web server the way `docker/nginx.conf` does: `/privacy` serves `privacy.html`, and
`index.html`, `sw.js`, `registerSW.js` and `manifest.webmanifest` aren't cached, or installed
copies won't update.

## Development

```bash
npm install
npm run dev      # http://localhost:5173, with the sign-in Worker
npm test
npm run check    # type-check
npm run build
```

The service worker only runs in production builds (`npm run build && npm run preview`).

### WebDAV sync locally

Works without any setup in the app. Point it at a WebDAV server that allows the dev origin,
`http://localhost:5173`, set up as in [WebDAV sync](#webdav-sync). Plain http is accepted for a
server on this computer.

### Google Drive sync

Optional; without credentials the app offers only WebDAV sync. Create a Google
Cloud OAuth client (*Web application*) with the Drive API enabled and the `drive.appdata`
scope, and add your origins to its JavaScript origins. Then set `VITE_GOOGLE_CLIENT_ID` in
`.env.local` and `GOOGLE_CLIENT_SECRET` in `.dev.vars` (see the `.example` files). The secret
stays in the sign-in Worker (`worker/index.ts`), which keeps people signed in.

### Deploying to Cloudflare

With Google Drive sync, the app runs on Cloudflare Workers: one Worker serves the built app and
the sign-in helper.

1. In `wrangler.jsonc`, set your own `name` and `routes` (or remove `routes` to use the
   Worker's `workers.dev` address).
2. For Google Drive sync, add the deployed address to the OAuth client's JavaScript origins and
   store the secret with `npx wrangler secret put GOOGLE_CLIENT_SECRET`. `VITE_GOOGLE_CLIENT_ID`
   is read at build time, from `.env.local` or the environment.
3. `npm run build`, then `npx wrangler deploy`.

To deploy on every push instead, connect the repository to Workers Builds, with
`VITE_GOOGLE_CLIENT_ID` as a build variable and `GOOGLE_CLIENT_SECRET` as a secret.

`public/privacy.html` describes the public instance: replace it with your own.

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
- `src/lib/sync/`: backup and sync
  - `merge.ts`: per-field merge for backup import and sync
  - `data-file.ts`: JSON export / import
  - `engine.ts`: pull, merge, push against any `SyncBackend`
  - `local-changes.ts`: tells sync a task was written
  - `drive.ts`, `google-auth.ts`: the Google Drive backend and sign-in
  - `webdav.ts`: the WebDAV backend
  - `sync.svelte.ts`: when to sync, connecting each service, and the state the sync menu shows
- `src/lib/ui/`: drag and drop (`dnd.ts`), shared UI state, theme, icons
- `src/components/`: the UI (Svelte 5)
- `worker/index.ts`: the sign-in Worker, which keeps people signed in to Drive
- `Dockerfile`, `docker-compose.yml`, `docker/nginx.conf`: the self-hosted image (WebDAV only)

## License

Copyright © 2026 Varvara Efremova, under the [AGPL-3.0](LICENSE). The name "Dumb Tasks" and
the app icon aren't covered by the license; please use your own for a fork.
