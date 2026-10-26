import { addTask } from './tasks';

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
