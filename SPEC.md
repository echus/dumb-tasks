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
  The input is focused on launch; on Android the PWA registers as a share target so text
  can be shared into it from any app.
- **Add:** a single always-visible text input. Enter adds to the top of Today.
- **Move:** drag a task. With a mouse it's the browser's drag-and-drop; on touch screens,
  long-press a task to pick it up (a small label follows your finger). Drop on a list to
  place it above or below the task under the pointer, or at the end. On phones, dropping on
  a tab sends the task to the end of that list without switching tabs.
- **Reorder:** drag within a bucket.
- **Complete:** click the task's icon; hovering it turns it into a tick. Task leaves the list.
- **Edit:** click into the text; it becomes a text field with the cursor where you clicked.
  Enter or clicking away saves, Escape cancels. Editing re-parses the deadline.
- **Delete:** a small × at the far right, shown on hover (on touch screens, while the task is
  being edited; swipe-to-delete is an idea). Removes from view (kept as a tombstone for sync).
- **Undo / redo:** buttons in the header (and ⌘Z / ⇧⌘Z, Ctrl+Z / Ctrl+Y) step back and forward
  through adds, edits, completions, deletions and moves made this session. An undo is written
  as a fresh edit, so it syncs like any other change.
- **Export / import:** full JSON backup. The code exists (`data-file.ts`) but has no UI yet;
  it'll get one alongside Google Drive sync.

## Deadlines

Parsed from the task text — there is no deadline field in the UI.

- Use an offline natural-language date parser (chrono-node, English only).
- **Resolve to an absolute date at creation** (and on edit). Never re-parse daily, or
  "by friday" would drift forever.
- Only accept clear date signals: "by …", "due …", "on the 14th", weekday names, explicit dates.
  Prefer missing a deadline over inventing one ("read 1984", "call May", "march for climate").
- Day/month order follows device locale, with a setting to override.
- Display: subtly underline the parsed phrase and show a badge, e.g.
  `pay rent by friday · 3 days left`. Badge colour escalates as the date approaches;
  past dates show `2 days overdue`.
- The AI can set or correct a task's deadline; that overrides the parsed value until the
  user next edits the text.

## Icons

Chosen automatically; never asked of the user. Each task shows an **emoji** in a circle tinted
with its category colour; the circle is also the checkbox (hovering shows a tick).

- `guessIcon(text) → { icon, category }` picks one of ~45 icons; each maps to an emoji.
- **Keyword matching:** a hand-written table of keywords and word stems, with nouns ranked
  above verbs ("buy birthday present" → 🎂, not 🛒).
- **Typos and abbreviations** count as near misses ("plumbr", "groc"), tried only when no
  exact keyword matches.
- **No match → a plain light-grey circle**, paler than the category tints; a tick appears in
  it on hover.
- Icons are guessed fresh from the text when shown, so keyword improvements reach older
  tasks too; an icon the AI set is kept.
- Each icon also has a broad **category** (home, errands, health, people, money, work,
  creative) that sets the circle colour. Red is never a category colour (it means overdue).
- Emoji look different on each platform (Apple, Google, Microsoft); that's accepted.

## Visual design

Calm and minimal, so the focus is on the tasks:

- Inter for text; Stack Sans Headline, lowercase, for the logo, bucket names, buttons and badges.
  No monospace. (Latin subsets, bundled, work offline.)
- **Ink accent:** the accent is the text colour itself (near-black in light mode, near-white
  in dark). The category-tinted emoji circles are the only colour in the app. Red only means
  overdue.
- Logo: an ink circle with a tick before "dumb tasks", matching the task icons; the favicon
  (follows light/dark) and app icon are the same circle on its own.
- Greyscale surfaces, corners only just rounded (4px), 1px hairlines, no borders around the
  lists.
- Every list is white on the light grey page. Bucket names are plain text above each list
  on desktop; on phones the tabs are the same plain text, and the selected one is a white tab joined to
  the list.
  No borders on the lists or the "add a task" box.
- Hover: header buttons darken to ink; the task icon's emoji turns into a tick (same circle).
- Deadline badges escalate by weight, not hue: outlined grey (later) → outlined (this week) →
  inverted (≤ 2 days) → red (overdue).
- Dark by default and follows the system, until the user flips the sun/moon toggle in the
  header; that choice is stored per device and applied before first paint.

## Data model

Single document, versioned. Draft shape:

```ts
interface DataFile {
  schemaVersion: number;
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

  // hidden — never shown as editable fields
  deadline: string | null;    // YYYY-MM-DD
  deadlineSource: 'parsed' | 'ai' | null;
  deadlineText: string | null; // phrase the deadline came from, for underlining
  icon: string | null;
  category: string | null;
  iconSource: 'auto' | 'ai';
  aiNote: string;             // context the AI keeps about this task

  fieldUpdatedAt: Record<string, string>; // per-field timestamps for merging
}
```

Device-only settings (never synced): sync credentials, locale override.

## Storage

- IndexedDB (via Dexie) in the browser/PWA.
- Request `navigator.storage.persist()` on first run; Android may otherwise evict data.
- Once backups have a UI, nudge users without sync to export one now and then.

## Sync

Optional and pluggable. The app pulls the data file, merges, and pushes back.

- **Backends:** **Google Drive first** — it's what regular people already have, and the MCP
  server depends on it. Use the app-specific folder or `drive.file` scope only, never full
  Drive access. WebDAV / Nextcloud comes later as a bonus for self-hosters.
- **Merge:** last-write-wins **per field** using `fieldUpdatedAt`, so editing text on one
  device and moving the task on another both survive. Deletes are tombstones. (Built, and
  already used by backup import.)
- **Concurrency:** conditional writes (ETag / If-Match); on conflict, re-pull, re-merge, retry.
- **When:** on app open, on tab focus, debounced after edits, and every few minutes.
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
| `set_icon(id, icon, category)` | Override the guess |
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

TypeScript · Vite · Svelte 5 · Dexie · chrono-node · Lucide · fractional-indexing ·
vite-plugin-pwa · Vitest · Inter · Stack Sans. Later: MCP TypeScript SDK.

## Milestones

1. ~~**Local PWA**~~ — four buckets, add / move / reorder / complete / edit, deadline parsing,
   keyword icons, JSON export/import (UI removed for now), installable and offline. *Built.*
2. ~~**Redesign**~~ — industrial look, light/dark theme switch. *Built.*
3. **Sync** — Google Drive backend on top of the existing merge logic, plus a settings place
   for sync and backup export / import.
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
