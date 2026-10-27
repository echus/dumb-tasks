import { mount } from 'svelte'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/stack-sans-headline/latin-700.css'
import './app.css'
import App from './App.svelte'
import { handleShareTarget, requestPersistentStorage } from './lib/startup'

handleShareTarget()
requestPersistentStorage()

// The service worker only belongs to production builds. Remove any left over from an
// earlier dev setup, which would keep serving stale pages.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
