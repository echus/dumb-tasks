import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The server tests (npm run test:servers): the app's WebDAV code against real servers in
// Docker. Apart from the other tests, as they need Docker and take a minute or two.
export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    include: ['tests/servers/**/*.test.ts'],
    globalSetup: ['tests/servers/setup.ts'],
    testTimeout: 20_000,
  },
});
