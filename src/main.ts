import { mount } from 'svelte';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import './app.css';
import App from './App.svelte';
import Outdated from './components/Outdated.svelte';
import { db, isDatabaseNewer } from './lib/db';
import { handleShareTarget, requestPersistentStorage } from './lib/startup';
import { dropOldTasks } from './lib/sync/data-file';
import { startSync } from './lib/sync/drive-sync.svelte';
import { addDemoTasks } from './lib/tasks/demo-tasks';
import { refreshColoursOnce } from './lib/tasks/recolour';

// The service worker only belongs to production builds. Remove any left over from an
// earlier dev setup, which would keep serving stale pages.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

const target = document.getElementById('app')!;

/** Stops this copy of the app using the database, which a newer version has upgraded. */
function stopUsingDatabase() {
  db.close({ disableAutoOpen: true });
}

async function start() {
  // A newer version of the app upgraded the database (normally the service worker updates
  // this copy first, so this is rare): leave the data alone and ask for a reload.
  // Not opening at all (e.g. storage blocked) is left to the app, which fails as before.
  if (await isDatabaseNewer().catch(() => false)) {
    stopUsingDatabase();
    mount(Outdated, { target });
    return;
  }
  // Another tab is upgrading the database to a newer version: reload into that version
  // rather than keep writing the old shape.
  db.on('versionchange', () => {
    stopUsingDatabase();
    location.reload();
    return false; // instead of Dexie's own close, which reopens on the next write
  });

  addDemoTasks().finally(handleShareTarget); // so a task shared on a first visit doesn't stop the demo
  dropOldTasks(); // sync does this too, but not every device syncs
  requestPersistentStorage();
  startSync().finally(refreshColoursOnce); // after the first sync, so it sees every device's tasks

  mount(App, { target });
}

start();
