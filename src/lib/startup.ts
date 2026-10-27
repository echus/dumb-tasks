import { addTask, refreshColours } from './tasks';

/** Text shared from another Android app arrives as query params; add it to Today once. */
export async function handleShareTarget(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const parts: string[] = [];
  for (const key of ['title', 'text', 'url']) {
    const value = params.get(key)?.trim();
    // Apps often repeat the URL inside the text, so skip anything already included.
    if (value && !parts.some((p) => p.includes(value))) parts.push(value);
  }
  if (!parts.length) return;
  history.replaceState(null, '', location.pathname); // so a reload doesn't add it again
  await addTask(parts.join(' '));
}

/** Without this, Android may clear local data when storage runs low. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported or denied: the app still works, it's just less protected.
  }
}

// Bump to recolour existing tasks again after the colour or icon rules change.
const COLOURS_VERSION = '2'; // ⭐ for unmatched tasks

/** Once per device, after the first sync: brings older tasks up to the current colour rules. */
export async function refreshColoursOnce(): Promise<void> {
  try {
    if (localStorage.getItem('colours') === COLOURS_VERSION) return;
    await refreshColours();
    localStorage.setItem('colours', COLOURS_VERSION);
  } catch {
    // Storage blocked: skip it rather than recolour on every load.
  }
}
