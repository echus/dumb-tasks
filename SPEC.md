# Dumb Tasks spec

*Status: milestones 1 to 3 are built. Release is next.*

A simple local-first task list. Each task is one line of text. You put each task in one of
four buckets: Today, Week, Month or Later.

## Who it is for

People who find apps like Todoist too complex. Each feature must be easy to understand
without thought. The app is open source and you can host it yourself, but self-hosters are
not the main users and do not drive the design.

## Principles

- A task is one line of text. There are no groups, tags, priorities or forms.
- The app works fully offline and needs no account. Sync is optional.
- Tasks change bucket only when the user moves them.

## Buckets

| Bucket | Use |
|--------|-----|
| Today  | The working list. It is one list, not one for each date. Tasks that are not done stay there. New tasks go here. |
| Week   | Tasks for the next few days, to move into Today later. |
| Month  | Tasks that must get done some time, but are not urgent. |
| Later  | Ideas and things for some day. Stored as `icebox`. |

Completed tasks leave their bucket. The app keeps them, with the completion time, for 90
days. Then they are removed like deleted tasks (see Sync).

## Interactions

The main goal is fast capture: open the app, type the task, and it is saved in a few
seconds.

- **Add:** each list starts with an "add a task" row. It looks like a task with an empty +
  ring for its icon. When the app opens, the Today row has focus. The row stays in view when
  a long list scrolls (under the tabs on phones). Enter adds the task below the row, and the
  row is ready for the next task. On Android the installed app is a share target, so you can
  share text into it from other apps.
- **Move:** drag a task to a different place or a different bucket. With a mouse, press and
  move. On a touch screen, long-press to pick it up. Mouse and touch use the same code, not
  the browser's drag and drop, which is unreliable with touch and cannot move the rows. A
  copy of the task follows the pointer, and the rows open a gap where it will go. Near the
  top or bottom of a list, the list scrolls. On phones, drop a task on a tab to put it at the
  end of that list, or hold it over a tab to open that list.
- **Complete:** click or tap the task icon. With a mouse, the icon changes to a tick on hover.
- **Edit:** click the text. The cursor goes where you clicked. Escape cancels. An edit
  parses the deadline again.
- **Delete:** a small × at the right of the task, where the deadline badge is. It shows on
  hover, or on touch screens while you edit the task. The task stays as a tombstone for sync.
- **Undo and redo:** buttons in the header, and ⌘Z / ⇧⌘Z or Ctrl+Z / Ctrl+Y. They go through
  the changes made since the app opened. An undo is written as a new edit, so it syncs like
  any other change.
- **Sync menu:** the sync button in the header opens it. There is a section for Google Drive
  and one for WebDAV, each with its sync status. Only one can be connected at a time. The
  backup section saves a full JSON backup and restores one. Restore merges like sync does,
  so it never deletes tasks.
- **Install:** the intro has an "Install app" pill, and the sync menu has an "install app"
  section (`ui/install.svelte.ts`). Both go away when the app runs installed. In Chrome and
  Edge they open the browser's install prompt. In other browsers the section gives the
  steps, and the pill opens the menu and highlights the section in yellow for a moment.
  There are steps for iPhone and iPad (any browser), Safari 17 or later on a Mac, and other
  Android browsers. Firefox on a computer cannot install web apps, so it shows neither.

## Deadlines

The app reads deadlines from the task text. There is no deadline field.

- chrono-node parses the dates, offline and in English only.
- The date is fixed when the task is added or edited. The app does not parse again each day,
  because then "by friday" would always move forward.
- Only clear date words count: "by …", "due …", "on the 14th", weekday names and full dates.
  It is better to miss a deadline than to make one up ("read 1984", "call May", "march for
  climate"). A length or an ordinal ("3d", "12 hr", "a day", "12th") counts only after a
  trigger word. "by 12th" is a deadline, but "3d printing", "bathurst 12 hr" and "21st
  birthday" are not.
- Day and month order comes from the device locale. Only en-US and en-PH put the month first.
- The parsed phrase gets a light underline. A badge (for example `3 days left`) shows at a
  fixed place on the right, so the badges line up and long text wraps before them. Past
  dates show `2 days overdue`.
- On hover the badge changes to the delete ×, with a button next to it to remove a date that
  was read wrongly. The task keeps the removed phrase, so an edit does not bring it back. A
  different date added later still counts.

## Icons

The app picks an icon for each task and never asks the user. The icon is an emoji in a
circle with its own fluoro colour. The circle is also the checkbox.

- `guessIcon(text)` in `tasks/guess-icon.ts` picks one of 49 emoji from a table of keywords
  and word stems.
- A wrong icon is worse than no icon, because it says something false about the task. When
  the match is not clear, the task gets ⭐.
- Strong keywords tell what the task is about ("dentist", "groceries"). Weak keywords are
  verbs and words with more than one meaning ("buy", "sync", "garage"), and count only when
  no strong keyword matches. Between two of the same strength the later word wins, because
  the thing usually comes after the verb ("email Sarah about the invoice" → 🧾).
- Phrases are matched first and replace their words: "tip run" → 🗑️, "oil change" → 🚗, "get
  the bike running" → ⭐. Some first words are verbs here but nouns in other places: "book
  flights" is booking, "read a good book" is reading.
- When no keyword matches, small typing errors in long words count ("plumbr", "groceires"):
  a letter missing, added or swapped. A changed letter does not count, because "change" is
  not "charge". The start of a word does not count either ("super" is not "supermarket").
- `tests/lib/tasks/icon-examples.ts` checks everyday tasks: at least 90% must get the right
  icon, and at most 3% a wrong one. When a guess is wrong, add the task there.
- The icon is picked when a task is added and again when its text is edited. To apply new
  rules to old tasks, increase `COLOURS_VERSION` in `tasks/recolour.ts`. Each device then
  guesses the icons of its open tasks again, one time.
- Each task gets a random fluoro colour, stored on the task. A new colour is picked only when
  the icon changes, so a new icon is easy to see. Hue and lightness vary freely. Plain orange
  and red are not used, because they look dull next to the others, so the warm colours go
  from golden yellow round to pinky red.
- Some hues make an icon hard to see, for example the grey trolley on blue. White icons only
  get dark blues and violets. A table for each emoji lists the hues to skip, measured from
  Apple's emoji by `scripts/measure-icon-clashes.js`. Emoji that are not in the table, and ⭐,
  can have any hue.
- A new task's hue is at least 60° from the task below it, and its lightness is at the other
  end of the range. Icons with few usable hues (📄 only gets blues and violets) go as far
  away as they can.

## Visual design

- Inter for text and deadline badges (semibold). Inter Display bold, in lowercase, for the
  logo and the bucket names. The fonts are bundled Latin subsets, so they work offline.
- The accent colour is the text colour: near-black in light mode and near-white in dark
  mode. The emoji circles and the deadline badges are the only colour in the app.
- The logo is an ink circle with a tick, then "dumb tasks". The favicon and app icon are the
  circle on its own. The favicon follows light and dark mode.
- Surfaces are grey, with 4px corners and 1px lines. Lists have a faint edge, not a border,
  and a soft glow in dark mode.
- On desktop the bucket names are plain text above each list. On phones they are tabs, and
  the selected tab has a 1px ink line under it. The other tabs and the header buttons are
  faded ink, and the header buttons go to full ink on hover.
- On desktop the page fits the window, and a long list scrolls in its own panel with the
  "add a task" row at the top. On phones the whole page scrolls.
- Deadline badges are outlined pills, so they do not compete with the icon circles. They are
  green for more than a week, yellow for this week and red for 2 days or less. Overdue badges
  are filled dark red with white text.
- The theme is dark by default and follows the system. The sun/moon button in the header
  changes it. The choice is stored on the device and applied before the first paint.

## Data model

One document with a version (see Versioning).

```ts
interface DataFile {
  schemaVersion: number;
  exportedAt: string;
  tasks: Task[];
  memory: string;          // for the MCP connector: what the AI knows about the user
  memoryUpdatedAt: string;
}

interface Task {
  id: string;              // ULID
  text: string;            // the only field the user edits
  bucket: 'today' | 'week' | 'month' | 'icebox';
  position: string;        // fractional index, so the order merges well
  createdAt: string;       // ISO timestamps throughout
  bucketHistory: { bucket: string; at: string }[]; // each move, merged by union. For the
                                                   // MCP connector, to see tasks that slip
  sorted: boolean;         // false until first moved. For the MCP connector
  completedAt: string | null;
  deletedAt: string | null; // tombstone

  // Parsed from the text again each time it changes. The MCP connector can also set them.
  deadline: {              // one object, so the date and phrase merge together
    date: string;          // YYYY-MM-DD
    phrase: string | null; // the phrase to underline; null if it was not parsed
  } | null;
  dismissedPhrases?: string[]; // phrases the user said are not dates
  icon: string | null;     // an emoji; null if no keyword matched (shows ⭐)
  colour: string;          // circle colour, picked again when the icon changes
  aiNote: string;          // for the MCP connector: notes about this task

  fieldUpdatedAt: Record<string, string>; // per-field timestamps for merging
}
```

Device settings do not sync. They are in their own `settings` table: the sync service in
use (`drive` or `webdav`) and its progress.

## Storage

- IndexedDB, through Dexie. The tables are `tasks` (indexed by bucket), `meta` (synced
  key/values, only `memory` for now) and `settings` (device only).
- On first run the app asks for persistent storage (`navigator.storage.persist()`). Android
  can delete the data otherwise.

## Versioning

Released apps hold real data, so a change to a stored format must come with an upgrade.
Installed apps update themselves, but a device can run an old version for some time.

- The data file (backups and each device's sync file) has a `schemaVersion`, with one
  upgrade step for each version in `sync/data-file.ts`. Any change to the shape of the file
  or a task increases it, even a new optional field, because an older app that merges a
  newer file drops the fields it does not know.
- An older app does not merge a newer file. It still merges the other devices' files and
  writes its own file in the shape it knows. The sync menu says to reload to update, and
  Restore refuses the file. A newer app upgrades older files, so an old device's tasks still
  arrive.
- The local database has Dexie versions in `db.ts`, each with an `.upgrade()` for the rows
  already there. A change to `Task` needs this and a data-file step. If a newer copy of the
  app (in another tab, for example) upgrades the database, an older copy reloads or shows
  "updated, reload". It does not write the old shape.
- Do not roll a deploy back past a version change. The older app would refuse the upgraded
  data until the next deploy. Fix forward.
- A pass over existing tasks that does not change their shape can use a run-once flag, like
  `refreshColoursOnce` in `tasks/recolour.ts`.

## Sync

Sync is optional. Each device has its own data file with everything it knows, and writes
only that file. A sync reads the files that other devices changed, merges them, and writes
this device's file again if it is out of date.

- Google Drive is the main backend, because most people already have it. WebDAV (Nextcloud,
  Apache) is for self-hosters who do not want a cloud service. A device uses one at a time.
  A backend has `pull(cursor)`, `push(json)` and `removeStale(maxAge)` (`SyncBackend` in
  `sync/engine.ts`).
- **Drive:** one `device-<id>.json` for each install, in the hidden app folder
  (`drive.appdata` scope), so the app never gets full Drive access. The id is made once for
  each install and stays the same when you connect again. Drive's Changes API tells which
  files changed since the last sync, so a sync with nothing to do is one small request.
  Before, all devices shared one file, `dumb-tasks.json`. The app now ignores it and deletes
  it with the stale files. A device that still runs that version makes it again until it
  updates, and its changes reach the other devices only after that. The app folder belongs
  to the OAuth client, so an MCP connector must use the same client, as one more device with
  its own file.
- **Sign-in:** the Google Identity Services popup gives a one-time code. A small Worker
  (`worker/index.ts`) exchanges it for a refresh token, which needs the client secret, and
  keeps it in an HttpOnly cookie. When the access token expires after an hour, the app gets
  a new one from the Worker, so users stay signed in until they disconnect or remove access.
  "Sign in again" shows only if that fails, and it accepts only the same account. To change
  accounts you must disconnect first, so this device's tasks never merge into a different
  account by accident. While a sync starts to read, the app checks that a new token is for
  the same account, and it writes or deletes nothing until the check passes. Tasks never go
  through the Worker. Disconnect removes this device's cookie but not Google's access,
  because that would sign out all devices.
- **WebDAV:** the same `device-<id>.json` files, in a `dumb-tasks` folder inside the folder
  the user gives. The app makes it on the first push. The browser connects to the server
  directly with Basic auth (an app password is best), so the server must allow the app's
  origin (CORS, see the README). Nothing goes through the Worker. A proxy could reach hosted
  servers that cannot be set up for CORS, but it would see passwords and tasks. A sync lists
  the folder (one `PROPFIND`) and downloads only the files whose ETag changed. The cursor is
  those ETags. The address, username and password are stored on the device, like the Drive
  token. A wrong password shows "Sign in again" with a password field. To change server or
  user, disconnect first.
- **Merge:** last write wins for each field, from `fieldUpdatedAt`. If you edit the text on
  one device and move the task on another, both changes stay. Deletes are tombstones. Backup
  restore uses the same merge. If this device's clock is behind the device that made a
  task's last edit, a new edit gets a time just after it, so an edit made after you saw
  another one always wins.
- Each file has one writer, so no locking is needed and no device overwrites another
  device's file. A change taken in from another device is also written to this device's
  file. Soon every file has every change, and losing any one file loses no data.
- The app keeps a hash of what this device's file holds, and writes the file only when the
  local data no longer matches.
- **When:** when the app opens, comes into view, gets focus or is left. Also as soon as a
  task is added, 3 s after other edits (so a set of moves goes in one push), every minute
  while in view, and when the device comes back online. While an edit waits, the sync menu
  shows "Syncing…" in place of the last sync time.
- **Stale files:** once each time the app opens, with the first pull, the app deletes other
  devices' files that did not change for 90 days (by Drive's clock, counted back from the
  newest file). The pull also ignores them. Their changes are in all the other files by
  then, and they can still hold tasks that the others removed since. On WebDAV one listing
  does both. If a device's own file was deleted, the same check tells it, and it writes the
  file again.
- Deleted and completed tasks are removed for good 90 days after the delete or completion.
- A device that comes back after more than 90 days can have tasks that the other devices
  already deleted or completed and then removed. Its first sync reads all files and removes
  nothing, so those tasks come back on all devices. To tell them apart from new tasks would
  need more records than this rare case is worth, and a wrong guess would lose a task.
- On the first sync, the app removes the demo tasks that no file has and that the user did
  not change, so an account that has data replaces them. It does not do this when there are
  no files, or when a file could not be read.
- A file that cannot be read (from a newer version, or damaged) is skipped, and the other
  files still sync. The sync menu says so. After this device updates, it reads the
  newer-version file again.
- Google brand verification passed and the OAuth app is published (October 2026), so anyone
  can connect Drive.

## Platforms

- Web app (PWA): static files and the small sign-in Worker, on Cloudflare Workers.
- Self-hosting: a Docker image with the static files (WebDAV sync only), or the same
  Cloudflare setup with your own Google client. The README has the steps.

## Stack

TypeScript · Vite · Svelte 5 · Dexie · chrono-node · Phosphor icons (app controls; tasks use
emoji) · fractional-indexing · ulid · vite-plugin-pwa · Vitest · Inter / Inter Display.

## Milestones

1. Local PWA: built.
2. Redesign: built. Industrial look, with light and dark themes.
3. Sync: built. Google Drive and WebDAV, and backup and restore.
4. Release: a free web app. Docker image, Cloudflare self-host steps, install steps for each
   browser, and feedback and donate links.

## Goals for later

- An MCP connector, so an AI client can read and sort the tasks.
- Play Store, with a TWA wrapper.

## Non-goals

- Groups, tags, priorities, or more fields on a task.
- Automatic moves between buckets.
- Recurring tasks. They belong in a calendar.
- Languages other than English.
- Sharing, or user accounts of our own.

## Open questions

- A section for tasks completed today? Time to undo a completion?
- Let the user change the icon, for example with a long-press?
- Swipe to delete on touch screens?
- A setting for day and month order?
- Remind users who do not sync to save a backup from time to time?
