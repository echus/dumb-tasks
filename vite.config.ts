/// <reference types="vitest/config" />
import { cloudflare } from '@cloudflare/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * The commit being built (Workers Builds says which, or the Docker build), shown so you can
 * tell what a device runs.
 */
function commit(): string {
  const sha = process.env.WORKERS_CI_COMMIT_SHA || process.env.COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Leaves out the privacy page and the links to it. It describes the public instance, which has
 * it because Google asks for one, so builds without Google Drive (self-hosted) don't need it.
 */
function withoutPrivacyPage(): Plugin {
  return {
    name: 'without-privacy-page',
    apply: 'build',
    transformIndexHtml: (html) => html.replace(' <a href="/privacy">Privacy</a>', ''),
    // Before the service worker is made, so it doesn't list the page either
    writeBundle() {
      const { root, build } = this.environment.config
      rmSync(resolve(root, build.outDir, 'privacy.html'), { force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __COMMIT__: JSON.stringify(commit()),
  },
  plugins: [
    svelte(),
    // Runs the Worker (worker/index.ts) alongside the app in dev and preview. Not in tests.
    !process.env.VITEST && cloudflare(),
    !loadEnv(mode, process.cwd()).VITE_GOOGLE_CLIENT_ID && withoutPrivacyPage(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // Fonts too, so the app looks right offline.
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      manifest: {
        name: 'Dumb Tasks',
        short_name: 'Dumb Tasks',
        description: 'A really simple task list.',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Lets Android share text from any app straight into Today.
        share_target: {
          action: '/',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
    }),
  ],
  // Svelte's browser build in tests too: its server build can't mount components
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  // The tests in tests/ (the browser tests have their own runner, Playwright)
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit', // npm test
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/servers/**', 'tests/browser/**'],
          // As a build without Google Drive, whatever .env.local says
          env: { VITE_GOOGLE_CLIENT_ID: '' },
        },
      },
      {
        extends: true,
        test: {
          // npm run test:servers: apart from the others, as they need Docker and take a minute
          name: 'servers',
          include: ['tests/servers/**/*.test.ts'],
          globalSetup: ['tests/servers/setup.ts'],
          testTimeout: 20_000,
        },
      },
    ],
  },
  // Lets `npm run preview` be reached through a Cloudflare quick tunnel for phone testing
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
}))
