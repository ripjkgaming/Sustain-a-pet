import { describe, it, expect, vi, afterEach } from 'vitest'
import handler, { generateQuest, modelChain, extractJson } from '../api/eco-quest.js'

const IMG = 'data:image/png;base64,iVBORw0KGgo='
const KEY_ENV = { OPENROUTER_API_KEY: 'test-key' }
const PRIMARY = 'nvidia/nemotron-3.5-super-vl:free'
const FALLBACK_1 = 'google/gemma-4-31b-it:free'
const FALLBACK_2 = 'google/gemma-4-26b-a4b-it:free'
const validRaw = {
  object: 'plastic water bottle',
  title: 'Refill, do not rebuy',
  action: 'Refill a reusable bottle from the tap today.',
  why: 'Single-use bottles add plastic waste.',
  xp: 10,
  confidence: 'high',
}
const chatOk = (content) => ({ choices: [{ message: { role: 'assistant', content } }] })
const jsonResponse = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })
const okFetch = (obj = validRaw) => vi.fn(async () => jsonResponse(chatOk(JSON.stringify(obj))))
const modelOf = (fetchImpl, call = 0) => JSON.parse(fetchImpl.mock.calls[call][1].body).model

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
  vi.restoreAllMocks()
})

describe('generateQuest', () => {
  it('returns a validated quest from the model on success', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ image: IMG, text: 'my bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
    expect(out.body.quest.id).toMatch(/^ai-[0-9a-f]{8}$/)
    expect(out.body.model).toBe(PRIMARY)
    expect(out.body.quest.xp).toBeGreaterThanOrEqual(5)
    expect(out.body.quest.xp).toBeLessThanOrEqual(15)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer test-key')
    expect(init.headers['HTTP-Referer']).toBeTruthy()
    expect(init.headers['X-Title']).toBeTruthy()
    const payload = JSON.parse(init.body)
    expect(payload.model).toBe(PRIMARY)
    expect(payload.messages[0]).toEqual({ role: 'system', content: expect.stringContaining('GreenLens') })
    expect(payload.messages[1].role).toBe('user')
    expect(payload.messages[1].content[0].type).toBe('text')
    expect(payload.messages[1].content[1]).toEqual({ type: 'image_url', image_url: { url: IMG } })
    expect(payload.response_format.type).toBe('json_schema')
    expect(payload.response_format.json_schema.name).toBe('eco_quest')
    expect(payload.response_format.json_schema.strict).toBe(true)
    expect(payload.response_format.json_schema.schema.required).toContain('xp')
  })

  it('never sends the API key in the body or the response', async () => {
    const fetchImpl = okFetch()
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(fetchImpl.mock.calls[0][1].body).not.toContain('test-key')
    expect(JSON.stringify(out.body)).not.toContain('test-key')
  })

  it('uses OPENROUTER_MODEL from env as the first model', async () => {
    const fetchImpl = okFetch()
    await generateQuest({ text: 'bottle', fetchImpl, env: { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'vendor/custom:free' } })
    expect(modelOf(fetchImpl)).toBe('vendor/custom:free')
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
    const fetchImpl = vi.fn(async () => jsonResponse(chatOk('not json')))
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

  it('extracts JSON when the model wraps it in fences and prose', async () => {
    const reply = `Here you go:\n\`\`\`json\n${JSON.stringify(validRaw)}\n\`\`\`\nHope it helps.`
    const fetchImpl = vi.fn(async () => jsonResponse(chatOk(reply)))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
    expect(out.body.quest.title).toBe(validRaw.title)
  })

  it('reads array-style message content', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: [{ type: 'text', text: JSON.stringify(validRaw) }] } }],
    }))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
  })

  it('falls back to the next model on 404 and succeeds', async () => {
    const fetchImpl = vi.fn(async (_url, init) => (
      JSON.parse(init.body).model === PRIMARY
        ? jsonResponse({ error: 'not found' }, false, 404)
        : jsonResponse(chatOk(JSON.stringify(validRaw)))
    ))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(modelOf(fetchImpl, 1)).toBe(FALLBACK_1)
    expect(out.body.model).toBe(FALLBACK_1)
    const lines = logSpy.mock.calls.map((args) => args.join(' '))
    expect(lines).toEqual([
      `[eco-quest] model=${PRIMARY} failed status=404`,
      `[eco-quest] model=${FALLBACK_1} answered, responded as ${FALLBACK_1}`,
    ])
    expect(lines.join('\n')).not.toContain('test-key')
  })

  it('reports the model id from the OpenRouter response when present', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...chatOk(JSON.stringify(validRaw)), model: 'vendor/actual:free' }))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
    expect(out.body.model).toBe('vendor/actual:free')
  })

  it('logs each failed fallback with its status code and never logs the key', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, false, 500))
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(502)
    const lines = logSpy.mock.calls.map((args) => args.join(' '))
    expect(lines).toEqual([
      `[eco-quest] model=${PRIMARY} failed status=500`,
      `[eco-quest] model=${FALLBACK_1} failed status=500`,
      `[eco-quest] model=${FALLBACK_2} failed status=500`,
    ])
    expect(lines.join('\n')).not.toContain('test-key')
  })

  it('falls back on 429 and 5xx, in fallback order', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 429))
      .mockResolvedValueOnce(jsonResponse({}, false, 503))
      .mockResolvedValueOnce(jsonResponse(chatOk(JSON.stringify(validRaw))))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(200)
    expect([modelOf(fetchImpl, 0), modelOf(fetchImpl, 1), modelOf(fetchImpl, 2)])
      .toEqual([PRIMARY, FALLBACK_1, FALLBACK_2])
  })

  it('does not fall back on a non-retryable 4xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'bad key' }, false, 401))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out).toEqual({ status: 502, body: { error: 'upstream_failed' } })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns 502 after every model in the chain fails with a retryable status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, false, 500))
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out).toEqual({ status: 502, body: { error: 'upstream_failed' } })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('returns 502 when fetch rejects', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })
    const out = await generateQuest({ text: 'bottle', fetchImpl, env: KEY_ENV })
    expect(out.status).toBe(502)
  })
})

describe('modelChain', () => {
  it('defaults to the free Nemotron vision model followed by two Gemma fallbacks', () => {
    expect(modelChain({})).toEqual([PRIMARY, FALLBACK_1, FALLBACK_2])
  })

  it('puts OPENROUTER_MODEL first and does not repeat it', () => {
    expect(modelChain({ OPENROUTER_MODEL: FALLBACK_2 })).toEqual([FALLBACK_2, PRIMARY, FALLBACK_1])
  })

  it('caps the chain at three models when OPENROUTER_MODEL is a new id', () => {
    expect(modelChain({ OPENROUTER_MODEL: 'vendor/custom:free' })).toEqual(['vendor/custom:free', PRIMARY, FALLBACK_1])
  })
})

describe('extractJson', () => {
  it('parses plain JSON, fenced JSON and JSON inside prose', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('sure: {"a":1} thanks')).toEqual({ a: 1 })
  })

  it('returns undefined when no JSON object is present', () => {
    expect(extractJson('no braces here')).toBeUndefined()
    expect(extractJson('{ broken')).toBeUndefined()
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
