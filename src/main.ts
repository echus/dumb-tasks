import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { handleShareTarget, requestPersistentStorage } from './lib/startup'

handleShareTarget()
requestPersistentStorage()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
