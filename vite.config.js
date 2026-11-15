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
function pwa() {
  const cacheFirst = (cacheName, urlPattern) => ({
    urlPattern,
    handler: 'CacheFirst',
    options: {
      cacheName,
      expiration: { maxEntries: 80 },
      cacheableResponse: { statuses: [0, 200] },
    },
  })
  return VitePWA({
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    // public/manifest.webmanifest is hand-written and linked from index.html.
    manifest: false,
    workbox: {
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
