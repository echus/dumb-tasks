# Dumb Tasks

A deliberately simple, local-first task list. Brain-dump one-line tasks, then sort them into
**Today**, **Week**, **Month** or **Icebox**. See [SPEC.md](SPEC.md) for the full design.

Everything is stored in your browser (IndexedDB). There's no account and no server.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run check    # type-check
npm run build    # production build in dist/
```

The service worker only runs in production builds; use `npm run build && npm run preview`
to test offline behaviour.

## Layout

- `src/lib/tasks.ts`: every task operation (add, move, complete, edit, delete)
- `src/lib/deadline.ts`: finds deadlines in task text ("by friday", "14 nov")
- `src/lib/guess-icon.ts`: picks an icon and colour category from keywords
- `src/lib/theme.svelte.ts`: light/dark toggle (follows the system until used)
- `src/lib/dnd.ts`: where dragged tasks land; long-press touch dragging
- `src/lib/merge.ts`: per-field merge for backup import and, later, sync
- `src/lib/data-file.ts`: JSON export / import (no UI yet; comes with sync)
- `src/components/`: the UI (Svelte 5)
