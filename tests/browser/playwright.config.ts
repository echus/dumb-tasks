import { defineConfig, devices } from '@playwright/test';
import { APP_ORIGIN } from '../servers/servers.ts';

// The browser tests (npm run test:browser): the production build in Chrome, as people get it,
// with the real WebDAV servers in Docker (setup.ts).
export default defineConfig({
  testDir: '.',
  globalSetup: './setup.ts',
  workers: 1, // the tests share the servers
  forbidOnly: true,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: APP_ORIGIN },
  webServer: {
    // A build without Google Drive, as its sign-in can't run here
    command: `npm run build && npm run preview -- --port ${new URL(APP_ORIGIN).port} --strictPort`,
    cwd: '../..',
    env: { VITE_GOOGLE_CLIENT_ID: '' },
    url: APP_ORIGIN,
    timeout: 120_000,
  },
});
