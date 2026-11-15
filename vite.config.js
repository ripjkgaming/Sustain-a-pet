import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import ecoQuestHandler from './api/eco-quest.js'

const MAX_BODY_BYTES = 6 * 1024 * 1024

// Reads the raw request body, rejecting anything over MAX_BODY_BYTES.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let failed = false
    req.on('data', (chunk) => {
      if (failed) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        failed = true
        reject(Object.assign(new Error('payload too large'), { status: 413 }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => {
      if (!failed) reject(err)
    })
  })
}

// Dev-only: serves /api/eco-quest from the Vite dev server. The OpenRouter key
// comes from env files via loadEnv and is passed to the handler directly, so
// it never reaches the client bundle (no `define`).
function ecoQuestDevApi(env) {
  return {
    name: 'eco-quest-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/eco-quest', async (req, res) => {
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        if (req.method === 'POST') {
          let raw
          try {
            raw = await readBody(req)
          } catch (err) {
            const tooLarge = err.status === 413
            return res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'payload_too_large' : 'bad_body' })
          }
          try {
            req.body = raw ? JSON.parse(raw) : {}
          } catch {
            return res.status(400).json({ error: 'bad_body', message: 'body is not valid JSON' })
          }
        }

        await ecoQuestHandler(req, res, env)
      })
    },
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
    plugins: [react(), ecoQuestDevApi(env), pwa()],
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
