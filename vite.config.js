import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

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
export default defineConfig({
  plugins: [react(), pwa()],
})
