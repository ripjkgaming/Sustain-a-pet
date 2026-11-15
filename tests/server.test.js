import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, missingConfig } from '../server/config.js'
import { createApp } from '../server/index.js'
import { createRateLimiter } from '../server/rateLimit.js'
import { createRetryingFetch } from '../server/upstream.js'

const dist = mkdtempSync(join(tmpdir(), 'sap-dist-'))
mkdirSync(join(dist, 'assets'))
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title>' + ' '.repeat(2000))
writeFileSync(join(dist, 'sw.js'), 'self.skipWaiting()')
writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')

const IMG = `data:image/png;base64,${Buffer.from('x'.repeat(40)).toString('base64')}`

function start(envOverrides = {}, { fetchImpl } = {}) {
  const env = { AI_MOCK: '1', DIST_DIR: dist, PORT: '0', ...envOverrides }
  const config = loadConfig(env)
  const lines = []
  const app = createApp(config, { env, log: (l) => lines.push(JSON.parse(l)), fetchImpl })
  return new Promise((resolve) => app.server.listen(0, '127.0.0.1', () => {
    resolve({ app, lines, base: `http://127.0.0.1:${app.server.address().port}`, env })
  }))
}
const post = (base, body, headers = {}) => fetch(`${base}/api/eco-quest`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
})

describe('config', () => {
  it('refuses mock mode and AI_BASE_URL in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', AI_MOCK: '1' })).toThrow(/test-only/)
    expect(() => loadConfig({ NODE_ENV: 'production', AI_BASE_URL: 'http://x' })).toThrow(/test-only/)
  })
  it('enforces timeout ordering client > server > upstream', () => {
    expect(() => loadConfig({ SERVER_TIMEOUT_MS: '20000' })).toThrow(/UPSTREAM_TIMEOUT_MS/)
    expect(() => loadConfig({ SERVER_TIMEOUT_MS: '50000' })).toThrow(/client timeout/)
    const c = loadConfig({})
    expect(c.upstreamTimeoutMs).toBeLessThan(c.serverTimeoutMs)
  })
  it('reports missing config names only', () => {
    expect(missingConfig(loadConfig({}), {})).toEqual(['OPENROUTER_API_KEY'])
    expect(missingConfig(loadConfig({}), { OPENROUTER_API_KEY: 'k' })).toEqual([])
    expect(missingConfig(loadConfig({ AI_MOCK: '1' }), {})).toEqual([])
  })
})

describe('rate limiter', () => {
  it('allows the burst then blocks with retryAfter, then refills', () => {
    let t = 0
    const rl = createRateLimiter({ max: 3, windowMs: 3000, now: () => t })
    expect([1, 2, 3].map(() => rl.take('a').allowed)).toEqual([true, true, true])
    const blocked = rl.take('a')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1)
    expect(rl.take('b').allowed).toBe(true)
    t = 1000
    expect(rl.take('a').allowed).toBe(true)
  })
})

describe('retrying fetch', () => {
  const res = (status) => ({ ok: status < 400, status })
  const fast = { wait: async () => {}, random: () => 1, baseMs: 100 }

  it('retries 5xx and 429, at most maxRetries times', async () => {
    const calls = []
    const f = createRetryingFetch({ ...fast, fetchImpl: async () => { calls.push(1); return res(503) }, maxRetries: 2 })
    expect((await f('u', {})).status).toBe(503)
    expect(calls).toHaveLength(3)
  })
  it('does not retry 400 or 404', async () => {
    for (const status of [400, 404]) {
      let n = 0
      const f = createRetryingFetch({ ...fast, fetchImpl: async () => { n += 1; return res(status) } })
      await f('u', {})
      expect(n).toBe(1)
    }
  })
  it('retries network errors then succeeds', async () => {
    let n = 0
    const f = createRetryingFetch({ ...fast, fetchImpl: async () => { n += 1; if (n < 3) throw new TypeError('fetch failed'); return res(200) } })
    expect((await f('u', {})).status).toBe(200)
    expect(n).toBe(3)
  })
  it('uses exponential backoff with jitter', async () => {
    const delays = []
    const f = createRetryingFetch({
      fetchImpl: async () => res(500), maxRetries: 2, baseMs: 100, random: () => 0.999999, wait: async (d) => { delays.push(d) },
    })
    await f('u', {})
    expect(delays).toHaveLength(2)
    expect(delays[0]).toBeLessThan(100)
    expect(delays[1]).toBeGreaterThan(100)
    expect(delays[1]).toBeLessThan(200)
  })
  it('never retries past the upstream deadline', async () => {
    let n = 0
    const f = createRetryingFetch({ ...fast, fetchImpl: async () => { n += 1; return res(500) }, deadlineAt: 1000, now: () => 990, baseMs: 5000, random: () => 1 })
    expect((await f('u', {})).status).toBe(500)
    expect(n).toBe(1)
  })
  it('does not retry after the signal aborts', async () => {
    const ac = new AbortController()
    ac.abort()
    let n = 0
    const f = createRetryingFetch({ ...fast, fetchImpl: async () => { n += 1; throw new Error('aborted') } })
    await expect(f('u', { signal: ac.signal })).rejects.toThrow()
    expect(n).toBe(1)
  })
})

describe('server', () => {
  let ctx
  beforeAll(async () => { ctx = await start({ RATE_LIMIT_MAX: '1000' }) })
  afterAll(() => ctx.app.close())

  it('healthz is 200, readyz reports mock mode', async () => {
    expect((await fetch(`${ctx.base}/healthz`)).status).toBe(200)
    const r = await fetch(`${ctx.base}/readyz`)
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ status: 'ready', mock: true, missing: [] })
  })

  it('valid request returns a quest from the mock upstream', async () => {
    const r = await post(ctx.base, { text: 'my bottle' })
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body).toMatchObject({ kind: 'quest', live: true, model: 'mock-model' })
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(r.headers.get('x-request-id')).toBeTruthy()
  })

  it('accepts a valid image', async () => {
    expect((await post(ctx.base, { image: IMG })).status).toBe(200)
  })

  it('returns JSON 400 for invalid input', async () => {
    for (const body of [{}, { text: 5 }, { image: 'data:image/gif;base64,AAAA' }, { text: 'x'.repeat(201) }, '{nope', '[]']) {
      const r = await post(ctx.base, body)
      expect(r.status).toBe(400)
      expect(r.headers.get('content-type')).toMatch(/application\/json/)
    }
  })

  it('returns JSON 415 for wrong content type', async () => {
    const r = await fetch(`${ctx.base}/api/eco-quest`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hi' })
    expect(r.status).toBe(415)
    expect((await r.json()).error).toBe('unsupported_media_type')
  })

  it('returns JSON 413 for an oversized body', async () => {
    const small = await start({ MAX_BODY_BYTES: '2048' })
    try {
      const r = await post(small.base, { text: 'a', pad: 'x'.repeat(5000) })
      expect(r.status).toBe(413)
      expect((await r.json()).error).toBe('payload_too_large')
      expect(small.lines.at(-1).error_category).toBe('payload_too_large')
    } finally { await small.app.close() }
  })

  it('returns JSON 405 for wrong method', async () => {
    const r = await fetch(`${ctx.base}/api/eco-quest`)
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('POST')
    expect((await r.json()).error).toBe('method_not_allowed')
  })

  it('/api never returns HTML, including unknown routes and traversal tricks', async () => {
    for (const path of ['/api', '/api/', '/api/nope', '/api/eco-quest/x', '/api/x.js', '/API/x']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const r = await fetch(`${ctx.base}${path}`, { method, body: method === 'POST' || method === 'PUT' ? '{}' : undefined, headers: { 'Content-Type': 'application/json' } })
        const type = r.headers.get('content-type') || ''
        const text = await r.text()
        if (path.toLowerCase().startsWith('/api/') || path === '/api') {
          if (path === '/API/x') continue // case-different path is just an extensionless SPA route
          expect(type, `${method} ${path}`).toMatch(/application\/json/)
          expect(text).not.toMatch(/<html|<!doctype/i)
        }
      }
    }
  })

  it('raw dot-segment paths under /api stay JSON', async () => {
    const { request } = await import('node:http')
    const url = new URL(ctx.base)
    for (const path of ['/api/./x', '/api/a/../x']) {
      const out = await new Promise((resolve) => {
        request({ host: url.hostname, port: url.port, path, method: 'GET' }, (res) => {
          let data = ''
          res.on('data', (c) => { data += c })
          res.on('end', () => resolve({ type: res.headers['content-type'], data }))
        }).end()
      })
      expect(out.type, path).toMatch(/application\/json/)
      expect(out.data).not.toMatch(/<html|<!doctype/i)
    }
  })

  it('rate limits with 429 and Retry-After', async () => {
    const limited = await start({ RATE_LIMIT_MAX: '2' })
    try {
      expect((await post(limited.base, { text: 'a' })).status).toBe(200)
      expect((await post(limited.base, { text: 'a' })).status).toBe(200)
      const r = await post(limited.base, { text: 'a' })
      expect(r.status).toBe(429)
      expect(Number(r.headers.get('retry-after'))).toBeGreaterThanOrEqual(1)
      expect((await r.json()).error).toBe('rate_limited')
      expect(limited.lines.at(-1).error_category).toBe('rate_limit')
    } finally { await limited.app.close() }
  })

  it('upstream 5xx yields a labelled fallback, not fabricated live output, after bounded retries', async () => {
    const r = await post(ctx.base, { text: 'mock:500' })
    const body = await r.json()
    expect(r.status).toBe(200)
    expect(body).toMatchObject({ live: false, fallback: true, source: 'prerecorded', model: null })
    expect(ctx.lines.at(-1)).toMatchObject({ error_category: 'upstream_error' })
  })

  it('server timeout returns JSON 504', async () => {
    // fetchImpl ignores the abort signal, so only the server request timeout can end the request.
    const slow = await start({ SERVER_TIMEOUT_MS: '1500', UPSTREAM_TIMEOUT_MS: '1000' }, { fetchImpl: () => new Promise(() => {}) })
    try {
      const r = await post(slow.base, { text: 'x' })
      expect(r.status).toBe(504)
      expect(r.headers.get('content-type')).toMatch(/application\/json/)
      expect((await r.json()).error).toBe('gateway_timeout')
      expect(slow.lines.at(-1).error_category).toBe('upstream_timeout')
    } finally { await slow.app.close() }
  })

  it('serves index.html for extensionless navigations only', async () => {
    const nav = await fetch(`${ctx.base}/some/deep/link`)
    expect(nav.status).toBe(200)
    expect(await nav.text()).toContain('<title>app</title>')
    expect(nav.headers.get('cache-control')).toBe('no-cache')
    for (const path of ['/missing.js', '/assets/missing-abc.js', '/assets/nope', '/models/x.glb', '/favicon.png']) {
      const r = await fetch(`${ctx.base}${path}`)
      expect(r.status, path).toBe(404)
      expect(await r.text()).not.toMatch(/<html|<!doctype/i)
    }
  })

  it('blocks path traversal', async () => {
    const r = await fetch(`${ctx.base}/%2e%2e/%2e%2e/etc/passwd`)
    expect(await r.text()).not.toContain('root:')
    const raw = await fetch(`${ctx.base}/..%2f..%2fpackage.json`)
    expect(raw.status).toBe(404)
  })

  it('sets cache and security headers', async () => {
    const a = await fetch(`${ctx.base}/assets/app-abc123.js`)
    expect(a.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const sw = await fetch(`${ctx.base}/sw.js`)
    expect(sw.headers.get('cache-control')).toBe('no-cache')
    const idx = await fetch(`${ctx.base}/`)
    expect(idx.headers.get('x-content-type-options')).toBe('nosniff')
    expect(idx.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(idx.headers.get('etag')).toBeTruthy()
    expect((await fetch(`${ctx.base}/`, { headers: { 'If-None-Match': idx.headers.get('etag') } })).status).toBe(304)
  })

  it('compresses text assets', async () => {
    const r = await fetch(`${ctx.base}/`, { headers: { 'Accept-Encoding': 'gzip' } })
    expect(r.headers.get('content-encoding')).toBe('gzip')
  })

  it('logs one JSON line per request without query, body or secrets', async () => {
    const before = ctx.lines.length
    await post(ctx.base, { text: 'SECRET-NOTE-123', image: IMG })
    await fetch(`${ctx.base}/healthz?token=abc`)
    const added = ctx.lines.slice(before)
    expect(added).toHaveLength(2)
    expect(added[0]).toMatchObject({ method: 'POST', path: '/api/eco-quest', status: 200, model: 'mock-model', error_category: 'none' })
    expect(added[1].path).toBe('/healthz')
    const dump = JSON.stringify(added)
    expect(dump).not.toContain('SECRET-NOTE-123')
    expect(dump).not.toContain('base64')
    expect(dump).not.toContain('token=abc')
    for (const key of ['ts', 'request_id', 'method', 'path', 'status', 'latency_ms', 'model', 'error_category']) expect(added[0]).toHaveProperty(key)
  })
})

describe('readiness without key', () => {
  it('returns 503 listing names only, and 200 once the key exists', async () => {
    const secret = 'sk-or-SUPERSECRETVALUE'
    const no = await start({ AI_MOCK: '' })
    try {
      const r = await fetch(`${no.base}/readyz`)
      expect(r.status).toBe(503)
      const body = await r.json()
      expect(body).toMatchObject({ status: 'not_ready', mock: false, missing: ['OPENROUTER_API_KEY'] })
      expect((await fetch(`${no.base}/healthz`)).status).toBe(200)
      const gen = await post(no.base, { text: 'x' })
      expect(gen.status).toBe(503)
      expect((await gen.json()).error).toBe('ai_unconfigured')
    } finally { await no.app.close() }
    const yes = await start({ AI_MOCK: '', OPENROUTER_API_KEY: secret })
    try {
      const r = await fetch(`${yes.base}/readyz`)
      expect(r.status).toBe(200)
      expect(JSON.stringify(await r.json())).not.toContain(secret)
    } finally { await yes.app.close() }
  })
})
