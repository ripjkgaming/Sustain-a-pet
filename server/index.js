// Production server: one Node process that serves the built SPA (dist/) and POST /api/eco-quest.
// Plain node:http, no framework, no runtime dependencies. Run with `npm start` after `npm run build`.
//
// Rules this file enforces:
// - /api/* always answers JSON and never falls through to index.html.
// - SPA fallback only for GET/HEAD navigations without a file extension, outside /api and /assets.
// - Credentials come from server env only (OPENROUTER_API_KEY). Nothing here reaches the client bundle.
// - Logs are one JSON line per request and never contain credentials, photos, base64 or user notes.
// - Timeouts: client 45 s > server 40 s > upstream 30 s (see server/config.js).
import { randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompress, gzip } from 'node:zlib'
import { promisify } from 'node:util'
import { completeQuest, generateQuest } from '../api/eco-quest.js'
import { loadConfig, missingConfig } from './config.js'
import { createRateLimiter } from './rateLimit.js'
import { createMockFetch, createRetryingFetch, withBaseUrl } from './upstream.js'

const brotli = promisify(brotliCompress)
const gz = promisify(gzip)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.glb', '.gltf', '.txt', '.map', '.wasm'])
const MAX_COMPRESS_BYTES = 20 * 1024 * 1024

// Content-Security-Policy tuned for a Vite SPA with three.js: no inline scripts, WebGL workers and blob textures allowed.
const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "media-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' data: blob:", "worker-src 'self' blob:", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ')

function securityHeaders(res, proto) {
  res.setHeader('Content-Security-Policy', CSP)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  if (proto === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

/** Cache-Control by path. Hashed assets are immutable; entry document and service worker must revalidate. */
export function cacheControlFor(urlPath) {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/sw.js' || urlPath === '/sw-extra.js' || urlPath === '/registerSW.js'
    || /^\/workbox-[\w-]+\.js$/.test(urlPath) || urlPath === '/manifest.webmanifest') return 'no-cache'
  if (urlPath.startsWith('/models/') || urlPath.startsWith('/textures/')) return 'public, max-age=2592000'
  return 'public, max-age=86400'
}

const errorCategory = (status, body) => {
  if (status === 413) return 'payload_too_large'
  if (status === 429) return 'rate_limit'
  if (status === 504) return 'upstream_timeout'
  if (status === 502) return 'upstream_error'
  if (status >= 500) return 'internal'
  if (status >= 400) return 'validation'
  if (body?.fallback) return body.fallback_reason === 'timeout' ? 'upstream_timeout' : 'upstream_error'
  return 'none'
}

export function createApp(config, { env = process.env, log = (line) => process.stdout.write(`${line}\n`), fetchImpl } = {}) {
  const distDir = resolve(config.distDir)
  const limiter = createRateLimiter({ max: config.rateLimitMax, windowMs: config.rateLimitWindowMs })
  const baseFetch = fetchImpl ?? (config.mock ? createMockFetch() : withBaseUrl(globalThis.fetch, config.aiBaseUrl))
  // In mock mode no real key exists; the mock ignores the Authorization header.
  const apiEnv = config.mock ? { ...env, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY || 'mock-not-a-secret' } : env
  const compressed = new Map()
  const state = { draining: false }

  const clientIp = (req) => {
    if (config.trustProxy) {
      const fwd = req.headers['x-forwarded-for']
      if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
    }
    return req.socket.remoteAddress || 'unknown'
  }

  function sendJson(ctx, status, body, headers = {}) {
    const { res } = ctx
    if (res.headersSent || res.writableEnded) return
    ctx.status = status
    ctx.body = body
    const payload = JSON.stringify(body)
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      'Cache-Control': 'no-store',
      ...headers,
    })
    res.end(ctx.req.method === 'HEAD' ? undefined : payload)
  }

  function readBody(req) {
    return new Promise((resolveBody, reject) => {
      const declared = Number(req.headers['content-length'])
      if (Number.isFinite(declared) && declared > config.maxBodyBytes) {
        return reject(Object.assign(new Error('payload too large'), { status: 413 }))
      }
      const chunks = []
      let size = 0
      let done = false
      req.on('data', (chunk) => {
        if (done) return
        size += chunk.length
        if (size > config.maxBodyBytes) {
          done = true
          reject(Object.assign(new Error('payload too large'), { status: 413 }))
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => { if (!done) { done = true; resolveBody(Buffer.concat(chunks).toString('utf8')) } })
      req.on('error', (err) => { if (!done) { done = true; reject(err) } })
    })
  }

  async function handleEcoQuest(ctx) {
    const { req, res } = ctx
    if (req.method !== 'POST') return sendJson(ctx, 405, { error: 'method_not_allowed' }, { Allow: 'POST' })

    const rate = limiter.take(clientIp(req))
    if (!rate.allowed) {
      return sendJson(ctx, 429, { error: 'rate_limited', retry_after_s: rate.retryAfterSec }, { 'Retry-After': String(rate.retryAfterSec) })
    }
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return sendJson(ctx, 415, { error: 'unsupported_media_type', message: 'Content-Type must be application/json' })
    }

    let raw
    try {
      raw = await readBody(req)
    } catch (err) {
      if (err.status === 413) {
        res.setHeader('Connection', 'close')
        res.once('finish', () => req.destroy())
        return sendJson(ctx, 413, { error: 'payload_too_large', max_bytes: config.maxBodyBytes })
      }
      return sendJson(ctx, 400, { error: 'bad_body', message: 'could not read request body' })
    }
    let body
    try {
      body = raw ? JSON.parse(raw) : {}
    } catch {
      return sendJson(ctx, 400, { error: 'bad_body', message: 'body is not valid JSON' })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(ctx, 400, { error: 'bad_body', message: 'body must be a JSON object' })
    }

    if (body.action === 'complete') {
      const out = completeQuest({ token: body.token, clientId: body.clientId, env: apiEnv })
      return sendJson(ctx, out.status, out.body)
    }

    const deadlineAt = Date.now() + config.upstreamTimeoutMs
    const upstream = createRetryingFetch({
      fetchImpl: baseFetch, maxRetries: config.upstreamMaxRetries, baseMs: config.upstreamRetryBaseMs, deadlineAt,
      onRetry: (info) => { ctx.retries = (ctx.retries ?? 0) + 1; ctx.retryInfo = info },
    })
    const out = await generateQuest({
      image: body.image, text: body.text, clarification: body.clarification, history: body.history,
      constraints: body.constraints, clientId: body.clientId, env: apiEnv, fetchImpl: upstream, timeoutMs: config.upstreamTimeoutMs,
    })
    if (out.body?.model) ctx.model = out.body.model
    return sendJson(ctx, out.status, out.body)
  }

  function readiness() {
    const missing = missingConfig(config, env)
    const problems = []
    if (!existsSync(join(distDir, 'index.html'))) problems.push('DIST_DIR')
    if (state.draining) problems.push('shutting_down')
    const ready = missing.length === 0 && problems.length === 0
    return {
      status: ready ? 'ready' : 'not_ready',
      mock: config.mock, // true only in test mode; never true in production
      missing: [...missing, ...problems.filter((p) => p !== 'shutting_down')],
      ...(state.draining ? { draining: true } : {}),
    }
  }

  async function serveFile(ctx, filePath, urlPath, st) {
    const { req, res } = ctx
    const ext = extname(filePath).toLowerCase()
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`
    res.setHeader('Cache-Control', cacheControlFor(urlPath))
    res.setHeader('ETag', etag)
    res.setHeader('Vary', 'Accept-Encoding')
    if (urlPath === '/sw.js') res.setHeader('Service-Worker-Allowed', '/')
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream')
    ctx.status = 200
    if (req.headers['if-none-match'] === etag) {
      ctx.status = 304
      res.writeHead(304)
      return res.end()
    }
    const accept = String(req.headers['accept-encoding'] || '')
    const enc = COMPRESSIBLE.has(ext) && st.size >= 1024 && st.size <= MAX_COMPRESS_BYTES
      ? (/\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : null)
      : null
    if (enc) {
      const key = `${filePath}|${enc}|${st.mtimeMs}`
      let buf = compressed.get(key)
      if (!buf) {
        const source = await readFile(filePath)
        buf = enc === 'br' ? await brotli(source) : await gz(source)
        if (compressed.size > 200) compressed.clear()
        compressed.set(key, buf)
      }
      res.writeHead(200, { 'Content-Encoding': enc, 'Content-Length': buf.length })
      return res.end(req.method === 'HEAD' ? undefined : buf)
    }
    res.writeHead(200, { 'Content-Length': st.size })
    if (req.method === 'HEAD') return res.end()
    createReadStream(filePath).on('error', () => res.destroy()).pipe(res)
  }

  async function handleStatic(ctx, urlPath) {
    const { req, res } = ctx
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      ctx.status = 405
      ctx.category = 'validation'
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('Method Not Allowed')
    }
    let decoded
    try { decoded = decodeURIComponent(urlPath) } catch { decoded = null }
    const target = decoded && !decoded.includes('\0') ? normalize(join(distDir, decoded)) : null
    if (target && (target === distDir || target.startsWith(distDir + sep))) {
      const file = target === distDir ? join(distDir, 'index.html') : target
      const st = await stat(file).catch(() => null)
      if (st?.isFile()) return serveFile(ctx, file, urlPath, st)
    }
    // SPA fallback: only for navigations (no file extension), never under /assets/.
    const last = urlPath.split('/').pop()
    if (!last.includes('.') && !urlPath.startsWith('/assets/')) {
      const index = join(distDir, 'index.html')
      const st = await stat(index).catch(() => null)
      if (st?.isFile()) return serveFile(ctx, index, '/index.html', st)
    }
    ctx.status = 404
    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
  }

  async function route(ctx) {
    const { req } = ctx
    const urlPath = new URL(req.url, 'http://x').pathname
    ctx.path = urlPath

    if (urlPath === '/healthz') return sendJson(ctx, 200, { status: 'ok' })
    if (urlPath === '/readyz') {
      const body = readiness()
      ctx.category = 'none' // a failing readiness probe is not a request error
      return sendJson(ctx, body.status === 'ready' ? 200 : 503, body)
    }
    if (urlPath === '/api' || urlPath.startsWith('/api/')) {
      if (urlPath.replace(/\/+$/, '') === '/api/eco-quest') {
        // Server request timeout (below the client's 45 s, above the upstream 30 s).
        let timer
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { status: 504 })), config.serverTimeoutMs)
        })
        try {
          return await Promise.race([handleEcoQuest(ctx), timeout])
        } finally {
          clearTimeout(timer)
        }
      }
      return sendJson(ctx, 404, { error: 'not_found' })
    }
    return handleStatic(ctx, urlPath)
  }

  async function handler(req, res) {
    const start = process.hrtime.bigint()
    const inbound = req.headers['x-request-id']
    const id = typeof inbound === 'string' && /^[\w.-]{8,64}$/.test(inbound) ? inbound : randomUUID()
    const ctx = { req, res, id, status: 0, body: null, model: null, path: '' }
    res.setHeader('X-Request-Id', id)
    securityHeaders(res, req.headers['x-forwarded-proto'])
    try {
      await route(ctx)
    } catch (err) {
      const status = err.status === 504 ? 504 : 500
      sendJson(ctx, status, { error: status === 504 ? 'gateway_timeout' : 'server_error' })
    }
    const latency = Number(process.hrtime.bigint() - start) / 1e6
    ctx.category = ctx.category ?? errorCategory(ctx.status, ctx.body)
    log(JSON.stringify({
      ts: new Date().toISOString(), level: ctx.status >= 500 ? 'error' : 'info', msg: 'request', request_id: id,
      method: req.method, path: ctx.path || (req.url || '').split('?')[0], status: ctx.status,
      latency_ms: Math.round(latency * 10) / 10, model: ctx.model, error_category: ctx.category,
      ...(ctx.retries ? { upstream_retries: ctx.retries } : {}),
    }))
  }

  const server = createServer((req, res) => { handler(req, res).catch(() => { res.destroy() }) })
  server.requestTimeout = config.serverTimeoutMs
  server.headersTimeout = Math.min(15_000, config.serverTimeoutMs)
  server.keepAliveTimeout = 65_000

  return {
    server,
    state,
    readiness,
    async close() {
      state.draining = true
      await new Promise((done) => {
        server.close(() => done())
        server.closeIdleConnections()
      })
    },
  }
}

/** Replace console.* with JSON lines so library logs (handler diagnostics) stay machine-readable. */
function jsonConsole() {
  const emit = (level) => (...args) => process.stdout.write(`${JSON.stringify({
    ts: new Date().toISOString(), level, msg: args.map(String).join(' '),
  })}\n`)
  console.log = emit('info')
  console.info = emit('info')
  console.warn = emit('warn')
  console.error = emit('error')
}

export function main(env = process.env) {
  jsonConsole()
  let config
  try {
    config = loadConfig(env)
  } catch (err) {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'fatal', msg: err.message })}\n`)
    process.exit(1)
  }
  const app = createApp(config, { env })
  app.server.listen(config.port, config.host, () => {
    const addr = app.server.address()
    process.stdout.write(`${JSON.stringify({
      ts: new Date().toISOString(), level: 'info', msg: 'listening', port: addr.port, mock: config.mock,
      missing_config: missingConfig(config, env),
    })}\n`)
  })

  let stopping = false
  const stop = (signal) => {
    if (stopping) return
    stopping = true
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg: 'shutting_down', signal })}\n`)
    const force = setTimeout(() => process.exit(1), config.shutdownTimeoutMs)
    force.unref()
    app.close().then(() => process.exit(0))
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
