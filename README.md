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

## Layout

- `src/lib/tasks.ts`: every task operation (add, move, complete, edit, delete)
- `src/lib/deadline.ts`: finds deadlines in task text ("by friday", "14 nov")
- `src/lib/guess-icon.ts`: picks an icon and colour category from keywords
- `src/lib/merge.ts`: per-field merge used by import now and sync later
- `src/lib/data-file.ts`: JSON export / import
- `src/components/`: the UI (Svelte 5)
