# Dumb Tasks — Spec

*Status: draft, 2026-10-26. Milestone 1 built.*

A deliberately simple, local-first task list. You brain-dump one-line tasks, drop them into
Today / Week / Month / Icebox, and optionally plan your day by talking to the AI you already use.

## Who it's for

Regular people who bounce off complex task apps. Every feature has to pass the test
"would someone who finds Todoist too much still get this without thinking?"
It's also open source and self-hostable, as a bonus for people who care about that, but they
are not the primary audience and don't drive design decisions.

## Principles

- **One field.** A task is a line of text. No groups, tags, priorities or forms.
- **Local-first.** Works fully offline with no account. Sync is optional.
- **AI is optional.** The app is complete without it. When used, it plugs into the user's
  existing AI (via MCP) rather than requiring an API key.
- **Nothing moves on its own.** Tasks change bucket only by the user or by the AI.
- **Open source, self-hostable static app.**

## Buckets

| Bucket  | Meaning |
|---------|---------|
| Today   | The working list. Perpetual — not one list per date; undone tasks simply stay. **New tasks land here.** |
| Week    | Upcoming; candidates for promotion into Today. |
| Month   | Needs doing on some timeline, not urgent. |
| Icebox  | Ideas and someday stuff. |

Completed tasks leave their bucket but are kept (with completion time) as history.

## User interactions

- **Fast capture is the top UX goal:** open app → type → saved in a couple of seconds.
  Today's "add a task" row is focused on launch; on Android the PWA registers as a share target so text
  can be shared into it from any app.
- **Add:** every list starts with an "add a task" row, laid out like a task with an empty
  + ring for its icon. It stays in view (under the phone tabs) while a long list scrolls. Enter adds the task just below it, ready for the next one.
- **Move:** drag a task. With a mouse it's the browser's drag-and-drop; on touch screens,
  long-press a task to pick it up (a copy of the task follows your finger and the original fades). Drop on a list to
  place it above or below the task under the pointer, or at the end. A thin line showing
  where it'll land is the only drag highlight; a phone tab being dropped on gets the same
  thin underline. On phones, dropping on
  a tab sends the task to the end of that list without switching tabs.
- **Reorder:** drag within a bucket.
- **Complete:** click or tap the task's icon. With a mouse, hovering it first turns it into a
  tick. Task leaves the list.
- **Edit:** click into the text; it becomes a text field with the cursor where you clicked.
  Enter or clicking away saves, Escape cancels. Editing re-parses the deadline.
- **Delete:** a small × at the far right (where the deadline badge is), shown on hover (on touch screens, while the task is
  being edited; swipe-to-delete is an idea). Removes from view (kept as a tombstone for sync).
- **Undo / redo:** buttons in the header (and ⌘Z / ⇧⌘Z, Ctrl+Z / Ctrl+Y) step back and forward
  through adds, edits, completions, deletions and moves made this session. An undo is written
  as a fresh edit, so it syncs like any other change.
- **Sync and backup:** a sync button (circling arrows) in the header opens a small menu: connect / disconnect
  Google Drive, sync status, and "Save backup" / "Restore…" for a full JSON backup.
  Restoring merges like sync does; it never deletes.

## Deadlines

Parsed from the task text — there is no deadline field in the UI.

- Use an offline natural-language date parser (chrono-node, English only).
- **Resolve to an absolute date at creation** (and on edit). Never re-parse daily, or
  "by friday" would drift forever.
- Only accept clear date signals: "by …", "due …", "on the 14th", weekday names, explicit dates.
  Prefer missing a deadline over inventing one ("read 1984", "call May", "march for climate").
  Bare shorthand like "3d" or "2h" only counts after a trigger word ("3d printing" isn't a date).
- Day/month order follows device locale, with a setting to override.
- Display: subtly underline the parsed phrase and show a badge (e.g. `3 days left`) at a
  fixed spot on the right of the task, so badges line up and long text wraps before them.
  Hovering a task swaps its badge for the delete ×, in the same spot, with a remove-date
  button beside it for a date read wrongly. The task remembers the dismissed phrase, so
  editing the text doesn't bring it back (a later, different date still counts).
  The badge gets bolder as the date approaches; past dates show `2 days overdue`.
- The AI can set or correct a task's deadline; that overrides the parsed value until the
  user next edits the text.

## Icons

Chosen automatically; never asked of the user. Each task shows an **emoji** in a circle tinted
with a fluoro colour of its own; the circle is also the checkbox (hovering shows a tick).

- `guessIcon(text) → emoji` picks one of 44 emoji. The AI can pick any emoji.
- **Keyword matching:** a hand-written table of keywords and word stems, with nouns ranked
  above verbs ("buy birthday present" → 🎂, not 🛒).
- **Typos and abbreviations** count as near misses ("plumbr", "groc"), tried only when no
  exact keyword matches.
- **No match → a ⭐ star** (on the hues it shows up on, like any other icon).
- **Guessed once, then stored:** the icon is picked when a task is added and re-picked
  whenever its text is edited; otherwise the stored pick is shown. The AI can replace the
  pick with its own; that holds until the user next edits the text (like deadlines).
- **Circle colour:** each task gets a random fluoro colour, stored on the task. It's picked
  again only when the icon changes (an edit or the AI picking a different icon), so a
  new icon is easy to spot. Hue and lightness vary continuously, so no two tasks
  quite match. Any hue but straight orange and red (they look dull beside the rest): the
  warm end runs from golden yellow round to pinky red. Hues an icon would vanish on are
  skipped (e.g. the grey trolley on blue; white icons get the darker blues and violets),
  from a per-emoji table measured off Apple's emoji by `scripts/measure-icon-clashes.js`.
  Emoji not in the table (AI picks) can have any hue.
  A new task's hue keeps at least 60° from the task it lands above, and its lightness sits on
  the other side of the range, so neighbours never look alike. Icons with few usable hues
  (like 📄, blues and violets only) go as far away as they can.
- Emoji look different on each platform (Apple, Google, Microsoft); that's accepted.

## Visual design

Calm and minimal, so the focus is on the tasks:

- Inter for text and deadline badges (semibold); Inter Display bold, lowercase, for the logo
  and bucket names (tabs on phones).
  No monospace. (Latin subsets, bundled, work offline.)
- **Ink accent:** the accent is the text colour itself (near-black in light mode, near-white
  in dark). The fluoro emoji circles and the deadline badges are the only colour in the app.
- Logo: an ink circle with a tick before "dumb tasks", matching the task icons; the favicon
  (follows light/dark) and app icon are the same circle on its own.
- Greyscale surfaces, corners only just rounded (4px), 1px hairlines. The lists have a
  faint edge instead of borders, with a soft glow in dark mode only.
- Every list is white on the light grey page. Bucket names are plain text above each list
  on desktop; on phones the tabs are the same plain text, and the selected one has a 1px ink
  line under it; the others are grey.
- On desktop the page fits the window: a list taller than that scrolls inside its own panel,
  with its "add a task" row stuck on top. Phones scroll the whole page.
- Header icon buttons are the same faded ink as the unselected tabs.
- Hover: header buttons darken to ink; the task icon's emoji turns into a tick (same circle).
- Deadline badges are traffic lights, drawn as outlines so they don't compete with the icon
  circles: green (more than a week) → yellow (this week) → red (≤ 2 days). Overdue is the
  one filled badge: dark red with white text.
- Dark by default and follows the system, until the user flips the sun/moon toggle in the
  header; that choice is stored per device and applied before first paint.

## Data model

Single document, versioned. Draft shape:

```ts
interface DataFile {
  schemaVersion: 1;
  exportedAt: string;
  tasks: Task[];
  memory: string;          // user-level preferences the AI has learned
  memoryUpdatedAt: string; // for merging
}

interface Task {
  id: string;              // ULID
  text: string;            // the only user-edited field
  bucket: 'today' | 'week' | 'month' | 'icebox';
  position: string;        // fractional index, for merge-friendly ordering
  createdAt: string;       // ISO timestamps throughout
  bucketHistory: { bucket: string; at: string }[]; // every move; lets the AI spot tasks
                                                   // that keep slipping. Merged by union.
  sorted: boolean;         // false until first moved; not shown, but useful to the AI planner
  completedAt: string | null;
  deletedAt: string | null;   // tombstone

  // Derived from the text or set by the AI; never edited directly. Re-derived
  // whenever the text is edited, replacing anything the AI set.
  deadline: {                 // one object, so date and phrase merge as a unit
    date: string;             // YYYY-MM-DD
    phrase: string | null;    // phrase it was parsed from, for underlining; null if AI-set
  } | null;
  dismissedPhrases?: string[]; // phrases the user said aren't dates; parsing skips them
  icon: string | null;        // an emoji; null: no keyword matched (shows ⭐)
  colour: string;             // icon circle's CSS colour: random, re-picked when the icon changes
  aiNote: string;             // context the AI keeps about this task

  fieldUpdatedAt: Record<string, string>; // per-field timestamps for merging
}
```

Device-only settings (never synced): sync credentials, locale override. They get their own
`settings` table; so far it holds just `drive` (account email, access token, last sync).

## Storage

- IndexedDB (via Dexie) in the browser/PWA. Tables: `tasks` (indexed by bucket), `meta`
  (synced key/values; just `memory` for now) and `settings` (device-only).
- Request `navigator.storage.persist()` on first run; Android may otherwise evict data.
- Once backups have a UI, nudge users without sync to export one now and then.

## Sync

Optional and pluggable. The app pulls the data file, merges, and pushes back.

- **Backends:** **Google Drive first** — it's what regular people already have, and the MCP
  server depends on it. WebDAV / Nextcloud comes later as a bonus for self-hosters. A backend
  is just `load()` and `save(json, version)` (`SyncBackend` in `sync.ts`).
- **Drive:** one `dumb-tasks.json` in the hidden app folder (`drive.appdata` scope), never
  full Drive access. Found by name each sync, so a deleted file is simply made again.
  The app folder belongs to the OAuth client: check the MCP server can share it before
  milestone 4.
- **Sign-in:** Google Identity Services in the browser, no server. Tokens last an hour and
  there are no refresh tokens without a server, so after that the menu asks you to "Sign in
  again" (one tap; the popup closes itself). Edits made meanwhile wait locally. A token
  exchange on the MCP server's host would remove this later.
- **Merge:** last-write-wins **per field** using `fieldUpdatedAt`, so editing text on one
  device and moving the task on another both survive. Deletes are tombstones. (Built, and
  already used by backup import.)
- **Concurrency:** Drive has no conditional writes, so the file's `version` is checked just
  before writing; if it moved, re-pull, re-merge, retry. A write that still races another is
  harmless: the losing device keeps its changes locally and pushes them on its next sync.
- **Push only when needed:** after merging, push only if the remote file lacks something.
- **When:** on app open, when the app comes into view or is left, 3 s after edits, every
  5 minutes, and on coming back online.
- **Tombstone purge:** after a long retention window (e.g. 90 days). A device offline longer
  than that could resurrect deleted tasks — acceptable, but document it.
- **Google verification** is required before public release of Drive sync.

## AI integration — MCP connector

"Put the app inside the AI." An MCP server exposes the task list to the user's AI client
(e.g. Claude), so planning happens there, on the subscription they already pay for. The app
itself has no chat and needs no API key.

- **Hosted by the project, backed by Google Drive.** The user adds the connector to their AI
  client and signs in with Google; the server reads and writes their data file in Drive using
  the same merge logic as the app. It is just another sync client.
- **So MCP requires Google Drive sync.** Local-only and (later) WebDAV users don't get MCP.
  No self-hosted MCP server at this stage.
- **Stores almost nothing.** Google sign-in is the identity; tasks live only in the user's
  Drive. The server keeps just the connector's auth grants (encrypted Google tokens) in a small
  key-value store. No accounts or task database of our own.
- **Cheap to run.** The AI's thinking happens on the user's subscription; the server only
  does a couple of small Drive reads/writes per tool call. A serverless host (e.g. Cloudflare
  Workers) should cost nothing to a few dollars a month even at thousands of daily users.
  Prefer a free tier that stops serving at its limit over one that bills for overage.

**Tools:**

| Tool | Purpose |
|------|---------|
| `list_tasks(bucket?, include_completed_since?)` | Read the bank |
| `add_task(text, bucket?)` | Add (defaults to Today) |
| `update_task_text(id, text)` | Rephrase / split helper |
| `move_task(id, bucket, before_id?)` | Sort and prioritise |
| `complete_task(id)` / `delete_task(id)` | |
| `set_deadline(id, date \| null)` | Correct parsing |
| `set_icon(id, emoji)` | Override the guess with any emoji (a new icon gets a new colour) |
| `set_task_note(id, note)` | Hidden per-task context |
| `get_memory()` / `update_memory(text)` | User preferences |

**Suggested morning flow** (encoded as an MCP prompt): sort unsorted tasks from Today →
flag deadlines and overdue items → agree a realistic Today given the user's time and energy →
push the rest to Week / Month / Icebox → note anything learned in memory.

**Why MCP first:** planning seems most useful with the most capable models (Opus-class) and
the AI client's own memory. Through MCP that comes with the user's existing subscription at no
extra cost; through the API it would cost roughly $10–20/month per daily user (estimated for
Opus 5.5 with ~80 tasks and a short daily chat; ~$5–10 on Sonnet, under $1 on Haiku).

### Later options (decide after using the MCP planner for a while)

- **Bring-your-own API key:** in-app chat calling the API directly from the browser. No
  server, but too much setup for the primary audience; an advanced option at most.
- **Paid hosted AI:** in-app chat through our server on our API key, sold as an add-on
  subscription (Obsidian Sync-style: free local app, paid hosted extras). Needs accounts,
  billing (a merchant of record for VAT), fair-use caps and a privacy policy. Opus-level
  quality would make it expensive to offer.

Both would reuse the MCP tool definitions.

## Platforms and distribution

- PWA, served as static files (GitHub Pages / Netlify / Cloudflare Pages).
- Capacitor wrapper for the Play Store.
- Docker image serving the static app, for self-hosters.
- Hosted MCP server (small and stateless).

## Stack

TypeScript · Vite · Svelte 5 · Dexie · chrono-node · Phosphor icons (app controls; tasks use
emoji) · fractional-indexing · ulid · vite-plugin-pwa · Vitest · Inter / Inter Display.
Later: MCP TypeScript SDK.

## Milestones

1. ~~**Local PWA**~~ — four buckets, add / move / reorder / complete / edit, deadline parsing,
   keyword icons, JSON export/import (UI removed for now), installable and offline. *Built.*
2. ~~**Redesign**~~ — industrial look, light/dark theme switch. *Built.*
3. ~~**Sync**~~ — Google Drive backend on top of the existing merge logic, plus a settings place
   for sync and backup export / import. *Built.*
4. **MCP server** — hosted, Drive-backed; tools and morning-planning prompt.
5. **Release** — Play Store wrapper, docs site, Docker image, WebDAV backend.
6. **Decide on more AI** — after daily use of the MCP planner, revisit the later options above.

## Non-goals

- Groups, tags, priority fields, multiple task fields.
- Automatic bucket movement.
- **Recurring tasks.** If it recurs, it belongs in your calendar, not your to-do list.
- Languages other than English.
- Local AI models.
- In-app AI chat and self-hosted MCP server (for now; see later options).
- Collaboration/sharing, user accounts of our own.

## Open questions

- **MCP auth (main feasibility risk for the AI route).** Check what auth current AI clients'
  custom connectors require (e.g. OAuth) and how that combines with Google sign-in for Drive
  access, before building milestone 4.
- **Hosting the MCP server:** who pays, where it runs, and how that fits Google's
  verification for an app whose server touches user Drive data.
- Completed tasks: a collapsible "done today" section? Undo window?
- Allow a manual icon override (e.g. long-press), or keep it strictly automatic?
- Licence (MIT vs AGPL).
