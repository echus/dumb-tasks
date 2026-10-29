# Dumb Tasks

A simple, local-first, open source task list. You can sync tasks with Google Drive or with your
WebDAV server.

Live at [dumbtasks.app](https://dumbtasks.app).

## Self-host with Docker

The Docker image serves the app with nginx. The self-hosted image syncs with WebDAV only.

### Start the app

1. Get the code:

   ```bash
   git clone https://github.com/echus/dumb-tasks.git
   cd dumb-tasks
   ```

2. Build and start the container:

   ```bash
   docker compose up -d --build
   ```

3. Open `http://localhost:8080`.
4. Put the app behind a reverse proxy with https.

NOTE: Browsers can install the app and use it offline only on https or on localhost.

### Show the version

To show the commit in the sync menu, build with this command:

```bash
COMMIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

### Update the app

1. Get the new code: `git pull`.
2. Build and start the container again: `docker compose up -d --build`.

Installed apps get the new version the next time they open.

## Set up WebDAV sync

The browser connects directly to your WebDAV server. Thus, the server must allow the origin of
the app (CORS). The origin is the scheme and host of the app address, for example
`https://tasks.example.com`.

### Nextcloud

1. Install the [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword) app.
2. In the admin settings of WebAppPassword, add the app origin to the WebDAV/CalDAV origins.
3. In *Personal settings → Security*, make an app password.
4. In the Files app, open *Files settings*. Copy the WebDAV address, for example
   `https://cloud.example.com/remote.php/dav/files/you/`.

### Apache

1. Enable `mod_dav`, `mod_dav_fs`, `mod_auth_basic` and `mod_headers`.
2. Add this configuration to the `<Directory>` of the shared folder. Change the origin to the
   app origin.

   ```apache
   Dav On
   AuthType Basic
   AuthName "WebDAV"
   AuthUserFile /path/to/htpasswd
   # Browsers send the CORS check (OPTIONS) without a password
   <LimitExcept OPTIONS>
       Require valid-user
   </LimitExcept>
   # "always" also sends the headers with errors, for example a wrong password
   Header always set Access-Control-Allow-Origin "https://tasks.example.com"
   Header always set Access-Control-Allow-Methods "GET, PUT, DELETE, PROPFIND, MKCOL, OPTIONS"
   Header always set Access-Control-Allow-Headers "Authorization, Content-Type, Depth"
   Header always set Access-Control-Max-Age "86400"
   ```

3. Restart Apache.

### Other WebDAV servers

The server must:

- Answer `OPTIONS` requests without a password.
- Send the four `Access-Control-*` headers above with all responses, also with errors.

### Connect the app

1. In the app, open the sync menu.
2. Select *Connect WebDAV*.
3. Enter the folder address, your username and your password. On Nextcloud, use the app password.
4. Select *Connect*.

The app keeps one file for each device in a `dumb-tasks` folder at that address.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run check    # type check
npm run build
```

The service worker runs only in production builds: `npm run build && npm run preview`.

To test WebDAV sync, use a WebDAV server that allows the origin `http://localhost:5173`. The app
accepts `http` for a server on this computer.

### Google Drive and Cloudflare

- Google Drive sync needs a Google OAuth client: *Web application*, Drive API, `drive.appdata`
  scope. Add each app origin to its JavaScript origins.
- Local: `VITE_GOOGLE_CLIENT_ID` in `.env.local`, `GOOGLE_CLIENT_SECRET` in `.dev.vars`.
- Deploy: a Cloudflare Worker serves the app and the sign-in helper. `wrangler.jsonc` has the
  name and routes. In Workers Builds, set `VITE_GOOGLE_CLIENT_ID` as a build variable and
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

Copyright © 2026 Varvara Efremova, under the [AGPL-3.0](LICENSE). The license does not cover the
name "Dumb Tasks" or the app icon. Use a different name and icon for a fork.
