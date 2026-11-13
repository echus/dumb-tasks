# Dumb Tasks spec

A simple local-first task list. Release is next.

## Tasks

- The Later bucket is stored as `icebox`.
- Completed tasks are kept with their completion time for 90 days and then removed like
  deleted ones.
- Drag and drop is our own code for mouse and touch - the browser's drag and drop is
  unreliable on touch and cannot move the rows. On phones a task dropped on a tab goes to
  the end of that list.
- Undo writes a new edit so it syncs like any other change.
- On Android the installed app is a share target for text from other apps.
- The install pill opens the install prompt in Chrome and Edge. In other browsers it opens the
  sync menu at the install steps (`ui/install.svelte.ts`). Firefox on a computer cannot
  install web apps so it shows nothing.

## Deadlines

- Deadlines are parsed from the text with chrono-node (English only) and fixed to a date when
  the task is added or edited. Parsing again each day would make "by friday" move forward
  forever.
- Only clear date words count ("by", "due", "on the 14th", weekdays and full dates) because a
  missed deadline is better than a made-up one ("read 1984", "call May"). A length or ordinal
  like "3d" or "12th" needs a trigger word first - "by 12th" counts but "3d printing" does not.
- Day and month order comes from the device locale. Only en-US and en-PH put the month first.
- A date the user removes is kept as a dismissed phrase so an edit does not bring it back.
- Badges are green for more than a week, yellow within a week and red at 2 days or less.

## Icons

- `guessIcon` in `tasks/guess-icon.ts` picks one of 49 emoji from a keyword table. A wrong
  icon is worse than none so unclear matches get ⭐.
- Strong keywords say what the task is about ("dentist") and weak ones such as verbs or words
  with other meanings ("buy", "garage") count only when nothing strong matches. Between equals
  the later word wins ("email Sarah about the invoice" → 🧾).
- Phrases are matched before single words ("oil change" → 🚗) and some first words are read
  as verbs ("book flights").
- Typing slips in words of 6 or more letters count when nothing else matches - a letter
  missing, added or swapped but not changed ("change" is not "charge").
- `tests/lib/tasks/icon-examples.ts` must stay at 90% or more right and 3% or less wrong. Add
  tasks there when a guess goes wrong.
- An icon is guessed again only when its text changes. To apply new rules to existing tasks
  increase `COLOURS_VERSION` in `tasks/recolour.ts`.
- Circle colours are random and stored on the task. They change only with the icon so a new
  icon is easy to spot. Plain orange and red are not used and neither are hues an emoji would
  disappear on (measured with `scripts/measure-icon-clashes.js`). A new task's hue is at
  least 60° from the task next to it.

## Data and storage

- The data model is in `types.ts`. Each task field has its own time in `fieldUpdatedAt` for
  merging. `memory`, `aiNote`, `sorted` and `bucketHistory` are for the MCP connector.
- Data is in IndexedDB through Dexie (`db.ts`). Device settings such as the sync account are
  in a `settings` table that does not sync.
- The app asks for persistent storage on first run because Android can clear it otherwise.

## Versioning

Installed apps can run an old version for some time so every change to a stored format needs
an upgrade.

- Any change to the shape of the data file or a task increases `schemaVersion` with an
  upgrade step in `sync/data-file.ts`. This includes a new optional field, because an older
  app drops fields it does not know.
- An older app skips newer files but still syncs the others and asks for a reload. A newer
  app upgrades older files.
- A change to the local database needs a Dexie version with `.upgrade()` in `db.ts`. An
  older tab reloads when a newer one upgrades the database.
- Never roll a deploy back past a version change - fix forward.

## Sync

Each device writes only its own `device-<id>.json` and merges in the files that other devices
changed. With one writer for each file there is no locking, and any one file can be lost
without losing data.

- Google Drive uses the hidden app folder (`drive.appdata`) and the Changes API so a sync
  with nothing to do is one small request. The old shared `dumb-tasks.json` is ignored and
  deleted. An MCP connector would need the same OAuth client to see the folder.
- For sign-in the Google popup gives a one-time code. The Worker (`worker/index.ts`)
  exchanges it for a refresh token and keeps that in an HttpOnly cookie so people stay signed
  in. Tasks never go through the Worker. Signing in again only accepts the same account and
  nothing is written until that is checked. Disconnect forgets the cookie but does not revoke
  Google's access, as that would sign out every device.
- WebDAV connects from the browser to the server with Basic auth, so the server must allow
  the app's origin (CORS). A proxy is not used because it would see passwords and tasks.
  Changed files are found by ETag from one `PROPFIND`.
- Merge is last write wins for each field. If this device's clock is behind, an edit gets a
  time just after the one it replaces so it still wins. Backup restore uses the same merge
  and never deletes.
- Sync runs when the app opens, gets focus or comes into view, when it is back online, right
  after a task is added, 3 s after other edits and every minute while open.
- Files that did not change for 90 days are deleted and ignored. Deleted and completed tasks
  are removed after 90 days. A device that was away longer than that can bring removed tasks
  back - telling them apart is not worth the risk of losing a task.
- The first sync drops demo tasks that no file has. A file that cannot be read is skipped and
  the sync menu says so.

## Platforms

dumbtasks.app runs on Cloudflare Workers as static files plus the sign-in Worker. Self-hosting
uses Docker (WebDAV only) or the same Cloudflare setup with your own Google client. The README
has the steps.

## Goals for later

- MCP connector so an AI client can read and sort the tasks
- Play Store with a TWA wrapper

## Non-goals

- Groups, tags, priorities or more fields on a task
- Automatic moves between buckets
- Recurring tasks - they belong in a calendar
- Languages other than English
- Sharing or user accounts of our own

## Open questions

- A section for tasks done today, or time to undo a completion?
- Let the user change the icon?
- Swipe to delete on touch screens?
- A setting for day and month order?
- Remind people who do not sync to save a backup?
