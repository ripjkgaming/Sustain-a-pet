import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { ecoQuestMiddleware } from './server/ecoQuestMiddleware.js'

// Serves /api/eco-quest from `vite dev` and `vite preview` using the same
// handler as the serverless deployment (api/eco-quest.js).
function ecoQuestApi(env) {
  const mount = (server) => {
    server.middlewares.use('/api/eco-quest', ecoQuestMiddleware(env))
  }
  return {
    name: 'eco-quest-api',
    configureServer: mount,
    configurePreviewServer: mount,
  }
}

// Offline support (generateSW). Precaches the app shell, fonts and audio.
// Large models and textures are excluded from precache and cached on first
// use (CacheFirst) so the install stays small. Service worker is build-only.
// Update flow is "prompt": a new worker waits until the user taps Reload (src/pwa.jsx),
// so a running page never loses its hashed chunks mid-session. See docs/OFFLINE.md.
// Bump CACHE_VERSION when runtime cache contents change; public/sw-extra.js drops every other version.
const CACHE_VERSION = 'v1'
function pwa() {
  const cacheFirst = (cacheName, urlPattern) => ({
    urlPattern,
    handler: 'CacheFirst',
    options: {
      cacheName: `sustain-a-pet-${cacheName}-${CACHE_VERSION}`,
      expiration: { maxEntries: 80 },
      cacheableResponse: { statuses: [0, 200] },
    },
  })
  return VitePWA({
    registerType: 'prompt',
    injectRegister: false, // registration lives in src/pwa.jsxx (production only)
    // public/manifest.webmanifest is hand-written and linked from index.html.
    manifest: false,
    workbox: {
      cacheId: 'sustain-a-pet',
      cleanupOutdatedCaches: true,
      importScripts: ['sw-extra.js'],
      globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff,woff2,m4a}'],
      globIgnores: ['models/**', 'textures/**'],
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        cacheFirst('pet-models', ({ url }) => url.pathname.startsWith('/models/') && url.pathname.endsWith('.glb')),
        cacheFirst('pet-textures', ({ url }) => url.pathname.startsWith('/textures/')),
      ],
    },
  })
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix loads every variable, including OPENROUTER_API_KEY (no VITE_ prefix).
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), ecoQuestApi(env), pwa()],
    // Playwright specs live in e2e/ (run with `npm run test:e2e`), not vitest.
    test: { exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', 'demo-video/**'] },
    build: {
      rolldownOptions: {
        output: {
          strictExecutionOrder: true,
          codeSplitting: {
            groups: [
              // three.js + react-three packages (~1.3 MB min) split into chunks under 450 kB.
              { name: 'three', test: /node_modules[\\/](three|@react-three)[\\/]/, priority: 20, maxSize: 450_000 },
            ],
          },
        },
      },
    },
  }
})
