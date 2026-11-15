import { describe, it, expect, vi, afterEach } from 'vitest'
import handler, { generateQuest } from '../api/eco-quest.js'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const KEY_ENV = { GEMINI_API_KEY: 'test-key' }
const validRaw = {
  object: 'plastic water bottle',
  title: 'Refill, do not rebuy',
  action: 'Refill a reusable bottle from the tap today.',
  why: 'Single-use bottles add plastic waste.',
  xp: 10,
  confidence: 'high',
}
const geminiOk = (text) => ({ candidates: [{ content: { parts: [{ text }] } }] })
const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })
const okFetch = (obj = validRaw) => vi.fn(async () => jsonResponse(geminiOk(JSON.stringify(obj))))

let ipCounter = 0
function mockReq(overrides = {}) {
  ipCounter += 1
  return {
    method: 'POST',
    body: {},
    headers: { 'x-forwarded-for': `test-ip-${ipCounter}` },
    socket: {},
    ...overrides,
  }
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this },
    setHeader(key, value) { this.headers[key] = value },
    json(obj) { this.body = obj; return this },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('generateQuest', () => {
  it('returns a validated quest from the model on success', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ image: IMG, text: 'my bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
    expect(out.body.quest.id).toMatch(/^ai-[0-9a-f]{8}$/)
    expect(out.body.quest.xp).toBeGreaterThanOrEqual(5)
    expect(out.body.quest.xp).toBeLessThanOrEqual(15)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toContain('gemini-flash-latest:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('test-key')
    const payload = JSON.parse(init.body)
    expect(payload.generationConfig.responseMimeType).toBe('application/json')
    expect(payload.contents[0].parts[1].inline_data).toEqual({ mime_type: 'image/png', data: 'iVBORw0KGgo=' })
  })

  it('uses GEMINI_MODEL from env when set', async () => {
    const fetchImpl = okFetch()
    await generateQuest({ text: 'bottle', fetchImpl, env: { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-test-model' } })
    expect(fetchImpl.mock.calls[0][0]).toContain('gemini-test-model:generateContent')
  })

  it('returns 503 ai_unconfigured when the key is missing and never calls upstream', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: {} })
    expect(out).toEqual({ status: 503, body: { error: 'ai_unconfigured' } })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a body with neither image nor text', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(400)
    expect(out.body.error).toBe('bad_body')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an unsupported image mime type', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ image: 'data:image/gif;base64,R0lGOD', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects text longer than 200 characters', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ text: 'a'.repeat(201), fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects non-string text', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ text: 42, fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects an image whose decoded size exceeds 3.5MB', async () => {
    const fetchImpl = okFetch()
    const big = `data:image/png;base64,${'A'.repeat(5033168)}`
    const out = await generateQuest({ image: big, fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns 422 when the model output is not JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(geminiOk('not json')))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(422)
    expect(out.body.error).toBe('invalid_model_output')
  })

  it('returns 422 when the model JSON fails validateQuest', async () => {
    const fetchImpl = okFetch({ ...validRaw, object: undefined })
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(422)
    expect(out.body.error).toBe('invalid_model_output')
  })

  it('returns 502 when upstream responds 500', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, false, 500))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out).toEqual({ status: 502, body: { error: 'upstream_failed' } })
  })

  it('returns 502 when fetch rejects', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(502)
  })
})

describe('handler', () => {
  it('rejects non-POST with 405 and Allow header', async () => {
    const res = mockRes()
    await handler(mockReq({ method: 'GET' }), res, KEY_ENV)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('POST')
  })

  it('returns a quest for a valid POST', async () => {
    vi.stubGlobal('fetch', okFetch())
    const res = mockRes()
    await handler(mockReq({ body: { text: 'bottle' } }), res, KEY_ENV)
    expect(res.statusCode).toBe(200)
    expect(res.body.quest.id).toMatch(/^ai-[0-9a-f]{8}$/)
  })

  it('accepts a JSON string body', async () => {
    vi.stubGlobal('fetch', okFetch())
    const res = mockRes()
    await handler(mockReq({ body: JSON.stringify({ text: 'bottle' }) }), res, KEY_ENV)
    expect(res.statusCode).toBe(200)
  })

  it('returns 400 for a non-object body', async () => {
    const res = mockRes()
    await handler(mockReq({ body: ['bottle'] }), res, KEY_ENV)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('bad_body')
  })

  it('returns 429 after 10 requests from one IP within a minute', async () => {
    vi.stubGlobal('fetch', okFetch())
    const req = mockReq({ body: { text: 'bottle' } })
    for (let i = 0; i < 10; i += 1) {
      const res = mockRes()
      await handler(req, res, KEY_ENV)
      expect(res.statusCode).toBe(200)
    }
    const res = mockRes()
    await handler(req, res, KEY_ENV)
    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual({ error: 'rate_limited' })
  })
})
