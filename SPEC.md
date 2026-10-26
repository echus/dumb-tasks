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
- **"New" marker:** a subtle dot on tasks that have never been moved out of where they landed,
  so unsorted brain-dumps are easy to spot.
- **Move:** tap a task to show bucket buttons (all devices); drag between buckets on desktop.
  Touch drag-and-drop may come later.
- **Reorder:** drag within a bucket.
- **Complete:** checkbox. Task leaves the list; a toast offers Undo.
- **Edit:** tap the text. Editing re-parses the deadline.
- **Delete:** removes from view (kept as a tombstone for sync); a toast offers Undo.
- **Export / import:** full JSON backup, available with or without sync.

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

## Icons and colour

Chosen automatically; never asked of the user.

- Each icon belongs to one of ~8 **categories**, and colour comes from the category, so colour
  works as an implicit grouping:
  home · errands · health · people · money/admin · work · creative/learning · other
- Fixed, colour-blind-safe palette, one colour per category.
- **No confident match → neutral grey dot.** Better than a wrong guess.
- The AI may override icon/category; that sticks until the user edits the text.
- All guessing lives behind one `guessIcon(text) → { icon, category }` function.

**v1 — keyword matching (built).** A hand-written table of keywords and word stems, with
nouns ranked above verbs ("buy birthday present" → gift, not cart).

**v2 — on-device model (milestone 2).** A small text-embedding model run in the browser
(e.g. via transformers.js) compares the task's meaning with a short description of each icon,
so "sort out the boiler" finds the wrench without a keyword for it.

- No API key and no server: the model downloads once and is cached by the service worker.
- Capture must stay instant: save the task with the keyword guess first, then update the
  icon when the model's answer arrives.
- Keywords remain the fallback while the model is downloading, on devices too slow to run
  it, and for strong explicit matches the model gets wrong.
- Below a similarity threshold, show the grey dot.

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
  sorted: boolean;         // false until first moved → drives the "new" marker
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
- Nudge users without sync to export a backup now and then.

## Sync

Optional and pluggable. The app pulls the data file, merges, and pushes back.

- **Backends:** **Google Drive first** — it's what regular people already have, and the MCP
  server depends on it. Use the app-specific folder or `drive.file` scope only, never full
  Drive access. WebDAV / Nextcloud comes later as a bonus for self-hosters.
- **Merge:** last-write-wins **per field** using `fieldUpdatedAt`, so editing text on one
  device and moving the task on another both survive. Deletes are tombstones. (Built, and
  already used by import.)
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
vite-plugin-pwa · Vitest. Later: transformers.js (icon model), MCP TypeScript SDK.

## Milestones

1. ~~**Local PWA**~~ — four buckets, add / move / reorder / complete / edit, deadline parsing,
   keyword icons, JSON export/import, installable and offline. *Built.*
2. **On-device icon model** — embedding-based `guessIcon`, keywords as fallback.
3. **Sync** — Google Drive backend on top of the existing merge logic.
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
- **Icon model download size** (~20–30 MB) on mobile data: download on Wi-Fi only, or ask first?
- Completed tasks: a collapsible "done today" section? Undo window?
- Allow a manual icon override (e.g. long-press), or keep it strictly automatic?
- Licence (MIT vs AGPL).
