import { describe, it, expect, vi } from 'vitest'
import {
  ENDPOINT, aiDailyUsed, aiQuestLists, buildBody, confidenceCopy, describeError, fitWithin, requestEcoQuest,
} from '../src/greenLensClient.js'
import { MAX_AI_QUESTS_PER_DAY } from '../src/ecoQuest.js'

const IMG = 'data:image/jpeg;base64,AAAA'
const raw = { object: 'Plastic bottle', title: 'Refill, don’t rebuy', action: 'Refill this bottle at the tap today.', why: 'Each refill skips a new bottle.', xp: 40, confidence: 'high' }

const reply = (status, body, { json = true } = {}) => vi.fn(async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: json ? async () => body : async () => { throw new SyntaxError('not json') },
}))
const hang = () => vi.fn((_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))

describe('fitWithin', () => {
  it('scales the longest edge down to the max and keeps aspect ratio', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 })
  })
  it('never upscales small images', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 })
  })
  it('handles zero or bad sizes and extreme ratios', () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(NaN, 100)).toEqual({ width: 0, height: 0 })
    expect(fitWithin(10000, 5)).toEqual({ width: 1024, height: 1 })
  })
})

describe('buildBody', () => {
  it('keeps a data URL image and trimmed text', () => {
    expect(buildBody({ image: IMG, text: '  a mug  ' })).toEqual({ image: IMG, text: 'a mug' })
  })
  it('drops non data URLs, blank text, and returns null when empty', () => {
    expect(buildBody({ image: 'https://x/y.jpg', text: '   ' })).toBeNull()
    expect(buildBody({})).toBeNull()
    expect(buildBody()).toBeNull()
  })
  it('caps text at 200 characters', () => {
    expect(buildBody({ text: 'x'.repeat(300) }).text).toHaveLength(200)
  })
})

describe('requestEcoQuest', () => {
  it('POSTs JSON to the endpoint and returns a re-validated quest', async () => {
    const fetchImpl = reply(200, { quest: raw })
    const res = await requestEcoQuest({ image: IMG, text: 'bottle' }, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toMatchObject({ image: IMG, text: 'bottle', clientId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/) })
    expect(res.ok).toBe(true)
    expect(res.quest.xp).toBe(5) // table reward; the model's xp: 40 is ignored
    expect(res.quest.id).toMatch(/^ai-[0-9a-f]{8}$/)
  })
  it('does not call fetch when there is nothing to send', async () => {
    const fetchImpl = reply(200, { quest: raw })
    expect(await requestEcoQuest({ text: ' ' }, { fetchImpl })).toEqual({ ok: false, code: 'empty', status: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it.each([
    [503, 'ai_unconfigured'],
    [429, 'rate_limited'],
    [422, 'invalid_model_output'],
    [502, 'upstream_failed'],
    [413, 'payload_too_large'],
  ])('maps HTTP %i to %s', async (status, code) => {
    expect(await requestEcoQuest({ text: 'cup' }, { fetchImpl: reply(status, { error: code }) })).toEqual({ ok: false, code, status })
  })
  it('falls back to a status-based code when the error body is not JSON', async () => {
    expect(await requestEcoQuest({ text: 'cup' }, { fetchImpl: reply(503, null, { json: false }) })).toEqual({ ok: false, code: 'ai_unconfigured', status: 503 })
    expect((await requestEcoQuest({ text: 'cup' }, { fetchImpl: reply(500, null, { json: false }) })).code).toBe('upstream_failed')
  })
  it('rejects a 200 whose quest fails validation (unsafe content)', async () => {
    const res = await requestEcoQuest({ text: 'cup' }, { fetchImpl: reply(200, { quest: { ...raw, action: 'Mix bleach into it.' } }) })
    expect(res).toMatchObject({ ok: false, code: 'invalid_model_output' })
  })
  it('reports network failures without throwing', async () => {
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const res = await requestEcoQuest({ text: 'cup' }, { fetchImpl })
    expect(res.ok).toBe(false)
    expect(['network', 'offline']).toContain(res.code)
  })
  it('times out a hanging request', async () => {
    expect(await requestEcoQuest({ text: 'cup' }, { fetchImpl: hang(), timeoutMs: 10 })).toEqual({ ok: false, code: 'timeout', status: 0 })
  })
  it('honours a caller abort', async () => {
    const controller = new AbortController()
    const pending = requestEcoQuest({ text: 'cup' }, { fetchImpl: hang(), signal: controller.signal })
    controller.abort()
    expect((await pending).code).toBe('aborted')
  })
})

describe('describeError', () => {
  it('shows setup help, not a text fallback, when AI is unconfigured', () => {
    expect(describeError('ai_unconfigured')).toMatchObject({ setup: true, fallback: false })
  })
  it('offers the words fallback for unusable photos and model output', () => {
    for (const code of ['invalid_model_output', 'image_unreadable', 'payload_too_large', 'upstream_failed', 'timeout']) {
      expect(describeError(code).fallback).toBe(true)
    }
  })
  it('suggests waiting on rate limits and always has friendly copy', () => {
    expect(describeError('rate_limited')).toMatchObject({ retry: true, fallback: false })
    for (const code of ['nope', 'network', 'offline', 'empty']) {
      const copy = describeError(code)
      expect(copy.title.length).toBeGreaterThan(3)
      expect(copy.body.length).toBeGreaterThan(10)
    }
  })
})

describe('confidenceCopy', () => {
  it('never hides uncertainty: medium and low always carry a note', () => {
    expect(confidenceCopy('high').note).toBe('')
    expect(confidenceCopy('medium').note).not.toBe('')
    expect(confidenceCopy('low', 'Could be glass or plastic.')).toEqual({ label: 'Just a guess', note: 'Could be glass or plastic.' })
  })
})

describe('daily cap and quest lists', () => {
  it('counts completions only for today', () => {
    expect(aiDailyUsed({}, '2026-11-15')).toEqual({ used: 0, max: MAX_AI_QUESTS_PER_DAY, left: MAX_AI_QUESTS_PER_DAY })
    expect(aiDailyUsed({ aiDaily: { date: '2026-11-14', count: 3 } }, '2026-11-15').used).toBe(0)
    expect(aiDailyUsed({ aiDaily: { date: '2026-11-15', count: 3 } }, '2026-11-15')).toMatchObject({ used: 3, left: 0 })
  })
  it('lists open quests newest first and a few recent done ones', () => {
    const aiQuests = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({ id, status: i % 2 ? 'done' : 'open' }))
    const { open, done } = aiQuestLists({ aiQuests }, 2)
    expect(open.map((q) => q.id)).toEqual(['e', 'c', 'a'])
    expect(done.map((q) => q.id)).toEqual(['f', 'd'])
    expect(aiQuestLists(undefined)).toEqual({ open: [], done: [] })
  })
})
