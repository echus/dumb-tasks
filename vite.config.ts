/// <reference types="vitest/config" />
import { cloudflare } from '@cloudflare/vite-plugin'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** The commit being built (Workers Builds says which), shown so you can tell what a device runs. */
function commit(): string {
  const sha = process.env.WORKERS_CI_COMMIT_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT__: JSON.stringify(commit()),
  },
  plugins: [
    svelte(),
    // Runs the Worker (worker/index.ts) alongside the app in dev and preview. Not in tests.
    !process.env.VITEST && cloudflare(),
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
  // Not the copies of the app in other branches' worktrees
  test: {
    exclude: ['**/node_modules/**', '.claude/**'],
  },
  // Lets `npm run preview` be reached through a Cloudflare quick tunnel for phone testing
  preview: {
    allowedHosts: ['.trycloudflare.com'],
  },
})
