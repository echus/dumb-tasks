# Dumb Tasks spec

A simple local-first task list.

## Overview

### Design choices

- Static web app made with Svelte 5 and Vite
- PWA with a service worker - works offline and installs
- All data in IndexedDB in the browser
- Sync is optional - JSON files in the user's Google Drive or WebDAV server
- The sign-in Worker is the only server code
- A backup is the same JSON format exported and imported by hand
- A task is one line of text in one of four buckets: Today, Week, Month and Later
- Deadline, icon and circle colour are derived from the text

### File structure

```
index.html              page shell
src/
  main.ts               starts the app
  App.svelte            top-level component with the live queries
  app.css               global styles and theme colours
  components/           UI components (Svelte 5)
    sync-menu/          sections of the sync and backup menu
  lib/                  everything that is not a component, imported as $lib
    types.ts            data model
    db.ts               IndexedDB tables and versions
    config.ts           build settings
    startup.ts          Android share target and persistent storage
    tasks/              task operations, undo, deadlines, icons and colours
    sync/               sync engine, merge, backends, backup file
    ui/                 drag and drop, install, theme, shared UI state
worker/
  index.ts              sign-in Worker for Google Drive
public/                 icons, privacy page, headers, robots and sitemap
tests/                  same layout as src/
  lib/ components/      unit tests (npm test)
  worker/               sign-in Worker tests
  servers/              WebDAV sync against Apache and Nextcloud in Docker
  browser/              Playwright tests of the production build
  helpers/              fake servers, fake Google sign-in, test devices
scripts/                one-off tools (preview image, icon colour clashes)
docs/                   README images
Dockerfile, docker-compose.yml, docker/   self-hosted image (WebDAV only)
wrangler.jsonc          Cloudflare deploy
vite.config.ts          build, PWA and test projects
```

### Data flow

A change made on this device:

```
user adds, edits or moves a task
  |
  v
tasks/tasks.ts          writes the change to IndexedDB
  |
  +--> App.svelte       live query sees the change and redraws the list
  |
  +--> sync/engine.ts   writes this device's file to Drive or WebDAV
```

A change made on another device:

```
the other device's file in Drive or WebDAV
  |
  v
sync/engine.ts          reads the file through drive.ts or webdav.ts
  |
  v
sync/merge.ts           merges its tasks with the tasks on this device
  |
  v
IndexedDB               stores the merged tasks
  |
  v
App.svelte              live query sees the change and redraws the list
```

## Data

```
src/lib/types.ts     data model (Task, DataFile)
src/lib/db.ts        IndexedDB tables
src/lib/startup.ts   persistent storage request
```

### Storage

- `tasks` table - syncs
- `settings` table - does not sync. Holds device settings such as the sync account
- Persistent storage is requested on first run - Android can clear the data otherwise

### Task fields

| Field | Note |
| --- | --- |
| `bucket` | Later is stored as `icebox` |
| `fieldUpdatedAt` | One time for each field for the merge |
| `completedAt` | Kept for 90 days and then the task is removed like a deleted one |
| `aiNote`, `sorted`, `bucketHistory` | For the MCP connector |
| `memory` (in the data file) | For the MCP connector |

## Sync

```
src/lib/sync/engine.ts         pull, merge, push
src/lib/sync/merge.ts          merge for each field
src/lib/sync/device-files.ts   what both backends share
src/lib/sync/sync.svelte.ts    when to sync and the state for the sync menu
src/lib/sync/drive.ts          Google Drive backend
src/lib/sync/google-auth.ts    Google sign-in
src/lib/sync/webdav.ts         WebDAV backend
worker/index.ts                sign-in Worker
```

### Files

- One file for each device: `device-<id>.json`
- A device writes only its own file - no locking
- A device merges in the files that other devices changed
- Any one file can be lost without losing data

### Merge

- Last write wins for each field
- Device clock behind - the edit gets a time just after the one it replaces so it still wins
- Undo - writes a new edit so it syncs like any other change
- Backup restore - same merge and never deletes
- First sync - drops demo tasks that no file has
- Unreadable file - skipped and the sync menu says so

### When sync runs

- App opens, gets focus or comes into view
- Device is back online
- Right after a task is added
- 3 s after other edits
- Every minute while the app is open

### Clean-up

- Device files with no change for 90 days - deleted and ignored
- Deleted and completed tasks - removed after 90 days
- Device away longer than 90 days - can bring removed tasks back. Telling them apart is not
  worth the risk of losing a task

### Backends

| | Google Drive | WebDAV |
| --- | --- | --- |
| Files are in | Hidden app folder (`drive.appdata`) | `dumb-tasks` folder on the server |
| Changed files found by | Changes API | ETag from one `PROPFIND` |
| Sign-in | Google popup and the sign-in Worker | Basic auth from the browser |
| Server setup | None | CORS for the app's origin |

Google Drive:

- A sync with nothing to do is one small request
- Old shared `dumb-tasks.json` - ignored and deleted
- An MCP connector needs the same OAuth client to see the folder

WebDAV:

- No proxy - it would see passwords and tasks

### Google sign-in

```
Google popup            gives a one-time code
  |
  v
worker/index.ts         exchanges the code for a refresh token
  |
  v
HttpOnly cookie         keeps the refresh token so people stay signed in
```

- Tasks never go through the Worker
- Sign in again - only the same account is accepted and nothing is written before that check
- Disconnect - forgets the cookie but does not revoke Google's access. Revoking signs out
  every device

## Versioning

```
src/lib/sync/data-file.ts   schemaVersion and upgrade steps
src/lib/db.ts               Dexie versions
```

Installed apps can run an old version for some time so every change to a stored format needs
an upgrade.

### Rules

- Change to the shape of the data file or a task - increase `schemaVersion` and add an upgrade
  step
- New optional field - also a `schemaVersion` change because an older app drops fields it
  does not know
- Change to the local database - new Dexie version with `.upgrade()`
- Never roll a deploy back past a version change - fix forward

### Old and new versions together

| Case | Result |
| --- | --- |
| Older app, newer file | Skips the file but syncs the others and asks for a reload |
| Newer app, older file | Upgrades the file |
| Older tab, newer tab upgrades the database | Older tab reloads |

## Deadlines

```
src/lib/tasks/deadline.ts       parser and deadlineHeat
src/components/TaskRow.svelte   badge colours
```

### Parsing

- Parser: chrono-node (English only)
- Fixed to a date when the task is added or edited - parsing again each day would make
  "by friday" move forward forever
- Day and month order: from the device locale. Only en-US and en-PH put the month first
- Removed date - kept as a dismissed phrase so an edit does not bring it back

### What counts as a date

A missed deadline is better than a made-up one.

| Text | Deadline | Reason |
| --- | --- | --- |
| "by", "due", "on the 14th", weekdays and full dates | Yes | Clear date words |
| "read 1984", "call May" | No | Not clear |
| "by 12th" | Yes | Ordinal after a trigger word |
| "3d printing" | No | Length with no trigger word |

### Badge colours

The colour is a gradient over `HEAT_HORIZON` (10 days). Days in between get a mix of the two
nearest colours.

| Time left | Badge |
| --- | --- |
| 10 days or more | Green outline |
| 5 days | Yellow outline |
| Due today | Red outline |
| Overdue | Filled dark red with white text |

## Icons

```
src/lib/tasks/guess-icon.ts         guessIcon and the keyword table
src/lib/tasks/circle-colours.ts     fallback emoji and circle colours
src/lib/tasks/recolour.ts           COLOURS_VERSION
tests/lib/tasks/icon-examples.ts    example tasks with thresholds
scripts/measure-icon-clashes.js     finds hues an emoji disappears on
```

### Matching

`guessIcon` picks one of 49 emoji from a keyword table. An unclear match gets ⭐ because a
wrong icon is worse than none.

| Rule | Example |
| --- | --- |
| Strong keywords say what the task is about | "dentist" |
| Weak keywords (verbs, words with other meanings) count only when nothing strong matches | "buy", "garage" |
| Between equals the later word wins | "email Sarah about the invoice" → 🧾 |
| Phrases before single words | "oil change" → 🚗 |
| Some first words are read as verbs | "book flights" |
| Typing slips in words of 6 or more letters count when nothing else matches | Letter missing, added or swapped |
| A changed letter is not a slip | "change" is not "charge" |

### Maintenance

- `icon-examples.ts` must stay at 90% or more right and 3% or less wrong
- Wrong guess found - add the task to `icon-examples.ts`
- An icon is guessed again only when the task text changes
- New rules for existing tasks - increase `COLOURS_VERSION`

### Circle colours

- Random and stored on the task
- Change only with the icon - a new icon is easy to spot
- New task - hue at least 60° from the task next to it
- Plain orange and red are not used - they look dull beside the rest
- Hues an emoji would disappear on are not used

## Drag and drop

```
src/lib/ui/drag-and-drop.ts   press to drop
```

- Custom code for mouse and touch - the browser's drag and drop is unreliable on touch and
  cannot move the rows
- Phones - a task dropped on a tab goes to the end of that list

## Install and platforms

```
src/lib/ui/install.svelte.ts   install pill
src/lib/startup.ts             Android share target
```

### Hosting

| Where | Setup | Sync |
| --- | --- | --- |
| dumbtasks.app | Cloudflare Workers with static files and the sign-in Worker | Google Drive and WebDAV |
| Self-hosted with Docker | Static files behind nginx | WebDAV only |
| Self-hosted on Cloudflare | Same as dumbtasks.app with a separate Google client | Google Drive and WebDAV |

### Install pill

| Browser | Result |
| --- | --- |
| Chrome and Edge | Opens the install prompt |
| Firefox on a computer | No pill - it cannot install web apps |
| Others | Opens the sync menu at the install steps |

On Android the installed app is a share target for text from other apps.

## Plans

### Goals for later

- MCP connector so an AI client can read and sort the tasks
- Play Store with a TWA wrapper

### Non-goals

- Groups, tags, priorities or more fields on a task
- Automatic moves between buckets
- Recurring tasks - they belong in a calendar
- Languages other than English
- Sharing or user accounts in the app

### Open questions

- A section for tasks done today or time to undo a completion?
- Let the user change the icon?
- Swipe to delete on touch screens?
- A setting for day and month order?
- Remind people who do not sync to save a backup?
