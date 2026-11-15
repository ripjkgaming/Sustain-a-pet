import http from 'node:http'
import { describe, it, expect, vi, afterEach } from 'vitest'
import handler from '../api/eco-quest.js'
import { ecoQuestMiddleware } from '../server/ecoQuestMiddleware.js'

const KEY_ENV = { OPENROUTER_API_KEY: 'test-key' }
const validRaw = {
  object: 'plastic water bottle',
  title: 'Refill, do not rebuy',
  action: 'Refill a reusable bottle from the tap today.',
  why: 'Single-use bottles add plastic waste.',
  xp: 10,
  confidence: 'high',
}
const upstreamOk = () =>
  vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { role: 'assistant', content: JSON.stringify(validRaw) } }] }),
  }))

let ipCounter = 0
const nextIp = () => `entry-ip-${(ipCounter += 1)}`

// Entry point 1: serverless style, called directly with (req, res).
async function viaServerless(body, env) {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this },
    setHeader(key, value) { this.headers[key] = value },
    json(obj) { this.body = obj; return this },
  }
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': nextIp() }, socket: {} }, res, env)
  return { status: res.statusCode, body: res.body }
}

// Entry point 2: the connect middleware used by `vite dev` and `vite preview`.
async function viaMiddleware(rawBody, env, method = 'POST') {
  const server = http.createServer((req, res) => ecoQuestMiddleware(env)(req, res))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const { port } = server.address()
    const real = await fetch(`http://127.0.0.1:${port}/api/eco-quest`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': nextIp() },
      body: method === 'POST' ? rawBody : undefined,
    })
    return { status: real.status, body: await real.json() }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// Calls both entry points with the same input. The middleware uses the real
// fetch to reach the local server, so only the upstream (OpenRouter) call is stubbed.
async function both(payload, env, upstream) {
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', (url, init) =>
    String(url).startsWith('http://127.0.0.1') ? realFetch(url, init) : upstream(url, init))
  const a = await viaServerless(payload, env)
  const b = await viaMiddleware(JSON.stringify(payload), env)
  return [a, b]
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('/api/eco-quest entry points', () => {
  it('returns the same 200 quest JSON shape through both', async () => {
    const [a, b] = await both({ text: 'my bottle' }, KEY_ENV, upstreamOk())
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    expect(b.body.quest.xp).toBe(a.body.quest.xp)
    expect(b.body.quest.title).toBe(a.body.quest.title)
    expect(b.body.model).toBe(a.body.model)
  })

  it('returns 503 ai_unconfigured through both when no key is set', async () => {
    const [a, b] = await both({ text: 'my bottle' }, {}, upstreamOk())
    expect(a).toEqual({ status: 503, body: { error: 'ai_unconfigured' } })
    expect(b).toEqual(a)
  })

  it('returns 400 bad_body through both for an empty request', async () => {
    const [a, b] = await both({}, KEY_ENV, upstreamOk())
    expect(a.status).toBe(400)
    expect(b).toEqual(a)
  })

  it('returns 400 for non-JSON body and 405 for GET via the middleware', async () => {
    expect((await viaMiddleware('not json', KEY_ENV)).status).toBe(400)
    expect(await viaMiddleware(undefined, KEY_ENV, 'GET')).toEqual({ status: 405, body: { error: 'method_not_allowed' } })
  })

  it('returns a labelled prerecorded fallback through both when the model call fails', async () => {
    const down = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }))
    const [a, b] = await both({ text: 'my bottle' }, KEY_ENV, down)
    expect(a.status).toBe(200)
    expect(a.body).toMatchObject({ kind: 'quest', live: false, fallback: true, source: 'prerecorded', fallback_label: 'Prerecorded tip, not a live AI result' })
    expect(b.status).toBe(200)
    expect(b.body.fallback).toBe(true)
  })
})
