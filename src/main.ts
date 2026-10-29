import { mount } from 'svelte';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import './app.css';
import App from './App.svelte';
import { dropOldTasks } from './lib/data-file';
import { handleShareTarget, refreshColoursOnce, requestPersistentStorage } from './lib/startup';
import { startSync } from './lib/sync-state.svelte';
import { addDemoTasks } from './lib/tasks';

addDemoTasks(); // before the share target, so a task shared on a first visit doesn't stop it
dropOldTasks(); // sync does this too, but not every device syncs
handleShareTarget();
requestPersistentStorage();
startSync().finally(refreshColoursOnce); // after the first sync, so it sees every device's tasks

// The service worker only belongs to production builds. Remove any left over from an
// earlier dev setup, which would keep serving stale pages.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
