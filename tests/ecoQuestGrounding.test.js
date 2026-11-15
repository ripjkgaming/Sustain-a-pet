import { describe, it, expect, vi, beforeEach } from 'vitest'
import handler, { completeQuest, generateQuest } from '../api/eco-quest.js'
import { createCompletionStore } from '../api/_completions.js'
import { signQuestToken, verifyQuestToken } from '../api/_questToken.js'
import { CLIENT_TIMEOUT_MS, UPSTREAM_TIMEOUT_MS } from '../src/ecoQuestConfig.js'
import { FALLBACK_QUESTS, pickFallback } from '../src/ecoQuestFallbacks.js'
import { isCuratedUrl, sourcesForLocation } from '../src/recyclingSources.js'
import { clampReward, rewardFor } from '../src/rewards.js'
import { completeEcoQuest, buildBody, recentHistory, requestEcoQuest } from '../src/greenLensClient.js'

const ENV = { OPENROUTER_API_KEY: 'sk-test-secret-key', QUEST_SIGNING_SECRET: 'unit-test-signing-secret-123' }
const CID = 'client-abcdef12'
const base = { object: 'glass jar', title: 'Reuse the jar', action: 'Wash the jar and use it for storage.', why: 'Reuse avoids new containers.', category: 'reuse', difficulty: 'easy', confidence: 'high', caveat: null, personalization_note: null, clarifying_question: null }
const reply = (obj) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }) })
const okFetch = (obj = base) => vi.fn(async () => reply(obj))
const sentBody = (fetchImpl) => JSON.parse(fetchImpl.mock.calls[0][1].body)
const userText = (fetchImpl) => sentBody(fetchImpl).messages[1].content[0].text
const gen = (extra = {}, fetchImpl = okFetch()) => generateQuest({ text: 'a jar', clientId: CID, env: ENV, fetchImpl, ...extra })

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}) })

describe('clarifying question', () => {
  it('returns exactly one question and no quest or token', async () => {
    const out = await gen({}, okFetch({ ...base, clarifying_question: 'Is it glass or plastic? Also what size is it?', title: '', action: '' }))
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ kind: 'clarify', clarifying_question: 'Is it glass or plastic?', live: true })
    expect(out.body).not.toHaveProperty('quest')
    expect(out.body).not.toHaveProperty('token')
  })
  it('does not ask again after a clarification: returns a low-confidence quest', async () => {
    const fetchImpl = okFetch({ ...base, clarifying_question: 'Which brand?', confidence: 'high' })
    const out = await gen({ clarification: 'glass' }, fetchImpl)
    expect(out.body.kind).toBe('quest')
    expect(out.body.quest.confidence).toBe('low')
    expect(out.body.quest.confidence_label).toMatch(/Low confidence/)
    const payload = sentBody(fetchImpl)
    expect(payload.messages[0].content).toContain('Do NOT ask another')
    expect(userText(fetchImpl)).toContain('"glass"')
  })
  it('falls back (labelled) when a re-ask has no usable quest', async () => {
    const out = await gen({ clarification: 'glass' }, okFetch({ ...base, clarifying_question: 'Which brand?', title: '', action: '' }))
    expect(out.body).toMatchObject({ kind: 'quest', fallback: true, live: false })
  })
  it('rejects a clarification over 200 characters before calling upstream', async () => {
    const fetchImpl = okFetch()
    const out = await gen({ clarification: 'x'.repeat(201) }, fetchImpl)
    expect(out.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('personalization inputs', () => {
  it('bounds history to 5 valid items and sends it as untrusted data', async () => {
    const history = Array.from({ length: 8 }, (_, i) => ({ title: `Quest ${i} <b>x</b>`, category: 'reuse', completedAt: '2026-11-1' + (i % 10) }))
    history.push({ title: 42 }, null)
    const fetchImpl = okFetch({ ...base, personalization_note: 'Builds on your Quest 0 reuse.' })
    const out = await gen({ history }, fetchImpl)
    expect(out.body.quest.personalization_note).toBe('Builds on your Quest 0 reuse.')
    const text = userText(fetchImpl)
    expect(text).toContain('untrusted data')
    const sent = JSON.parse(text.split('JSON): ')[1])
    expect(sent).toHaveLength(5)
    expect(JSON.stringify(sent)).not.toContain('<b>')
    expect(sentBody(fetchImpl).messages[0].content).toContain('personalization_note')
  })
  it('rejects non-array history and bad constraints', async () => {
    expect((await gen({ history: 'nope' })).status).toBe(400)
    expect((await gen({ constraints: [] })).status).toBe(400)
    expect((await gen({ constraints: { location: 'x'.repeat(61) } })).status).toBe(400)
    expect((await gen({ constraints: { location: 7 } })).status).toBe(400)
    expect((await gen({ clientId: 'no spaces allowed!' })).status).toBe(400)
  })
  it('passes location as untrusted data and forbids invented local rules in the prompt', async () => {
    const fetchImpl = okFetch()
    await gen({ constraints: { location: 'Austin, TX' } }, fetchImpl)
    expect(userText(fetchImpl)).toContain('"Austin, TX"')
    expect(sentBody(fetchImpl).messages[0].content).toMatch(/Never state or invent local recycling rules/)
  })
})

describe('curated sources', () => {
  const recycle = { ...base, category: 'recycle', title: 'Recycle the jar', action: 'Rinse the jar and check local recycling guidance.' }
  it('attaches code-chosen sources for recycling quests in a covered location', async () => {
    const out = await gen({ constraints: { location: 'Austin, TX' } }, okFetch(recycle))
    expect(out.body.quest.sources.length).toBeGreaterThan(0)
    for (const s of out.body.quest.sources) expect(isCuratedUrl(s.url)).toBe(true)
    expect(out.body.quest).not.toHaveProperty('source_note')
  })
  it('returns no sources and the note for an uncovered location', async () => {
    const out = await gen({ constraints: { location: 'Tokyo, Japan' } }, okFetch(recycle))
    expect(out.body.quest.sources).toEqual([])
    expect(out.body.quest.source_note).toBe('No curated source covers your location')
  })
  it('gives the note when no location is sent', async () => {
    const out = await gen({}, okFetch(recycle))
    expect(out.body.quest).toMatchObject({ sources: [], source_note: 'No curated source covers your location' })
  })
  it('never lets model-supplied URLs or sources through', async () => {
    const out = await gen({ constraints: { location: 'Tokyo' } }, okFetch({ ...recycle, sources: [{ url: 'https://evil.example' }], why: 'See https://evil.example/rules for details.' }))
    expect(JSON.stringify(out.body)).not.toContain('evil.example')
    expect(out.body.quest.sources).toEqual([])
  })
  it('does not add sources to non-recycling quests', async () => {
    const out = await gen({ constraints: { location: 'Austin, TX' } })
    expect(out.body.quest.sources).toEqual([])
    expect(out.body.quest).not.toHaveProperty('source_note')
  })
  it('matches locations conservatively', () => {
    expect(sourcesForLocation('Portland, OR')[0].url).toContain('epa.gov')
    expect(sourcesForLocation('Leeds, England')[0].url).toContain('recyclenow.com')
    expect(sourcesForLocation('Toronto, Ontario')[0].url).toContain('rco.on.ca')
    expect(sourcesForLocation('New England')).toEqual([]) // not the UK nation
    expect(sourcesForLocation('Ontario, California')).toEqual([]) // ambiguous
    expect(sourcesForLocation('somewhere')).toEqual([])
    expect(sourcesForLocation('')).toEqual([])
    expect(sourcesForLocation(undefined)).toEqual([])
  })
})

describe('confidence label', () => {
  it.each(['high', 'medium', 'low'])('always returns a plain-language label for %s', async (confidence) => {
    const out = await gen({}, okFetch({ ...base, confidence }))
    expect(out.body.quest.confidence).toBe(confidence)
    expect(out.body.quest.confidence_label.toLowerCase()).toContain(`${confidence} confidence`)
  })
})

describe('untrusted model output: rewards', () => {
  it('ignores model-set reward, xp and coins', async () => {
    const out = await gen({}, okFetch({ ...base, xp: 15, coins: 9999, reward: { xp: 99, coins: 999, leaves: 50 }, leaves: 50 }))
    expect(out.body.quest.reward).toEqual(rewardFor('reuse', 'easy'))
    expect(out.body.quest.xp).toBe(rewardFor('reuse', 'easy').xp)
    const token = verifyQuestToken(out.body.token, ENV.QUEST_SIGNING_SECRET)
    expect(JSON.stringify(token)).not.toMatch(/999|coins/)
    const done = completeQuest({ token: out.body.token, clientId: CID, env: ENV, store: createCompletionStore() })
    expect(done.body.reward).toEqual(rewardFor('reuse', 'easy'))
  })
  it('keeps every table reward inside the clamp', () => {
    for (const c of ['reuse', 'repair', 'recycle', 'save_water', 'save_energy', 'reduce_waste', 'transport', 'other', 'weird']) {
      for (const d of ['easy', 'medium', 'hard', 'weird']) {
        const r = rewardFor(c, d)
        expect(r.xp).toBeGreaterThanOrEqual(5)
        expect(r.xp).toBeLessThanOrEqual(15)
        expect(r.coins).toBe(r.xp + 5)
        expect(r.leaves).toBe(1)
      }
    }
    expect(clampReward({ xp: 1000, coins: 1000, leaves: 1000 })).toEqual({ xp: 15, coins: 20, leaves: 1 })
    expect(clampReward({ xp: 'a', coins: 1, leaves: 1 })).toBeNull()
  })
})

describe('completion', () => {
  const issue = async (clientId = CID, obj = base) => (await gen({ clientId }, okFetch({ ...obj, title: `${obj.title} ${Math.random()}` }))).body.token
  it('pays the table reward once per quest and rejects a duplicate', async () => {
    const store = createCompletionStore()
    const token = await issue()
    const first = completeQuest({ token, clientId: CID, env: ENV, store })
    expect(first).toMatchObject({ status: 200, body: { ok: true, reward: rewardFor('reuse', 'easy'), dailyUsed: 1, dailyMax: 3 } })
    expect(completeQuest({ token, clientId: CID, env: ENV, store })).toEqual({ status: 409, body: { error: 'already_completed' } })
  })
  it('enforces the daily cap of 3 per client per day and resets next day', async () => {
    const store = createCompletionStore()
    const now = Date.UTC(2026, 10, 15, 12)
    for (let i = 0; i < 3; i += 1) {
      expect(completeQuest({ token: await issue(), clientId: CID, env: ENV, store, now }).status).toBe(200)
    }
    const capped = completeQuest({ token: await issue(), clientId: CID, env: ENV, store, now })
    expect(capped).toMatchObject({ status: 429, body: { error: 'daily_cap', dailyUsed: 3, dailyMax: 3 } })
    expect(completeQuest({ token: await issue('other-client-99'), clientId: 'other-client-99', env: ENV, store, now }).status).toBe(200)
    // Next UTC day: cap resets. The token was issued with real time, so sign a fresh one for that day.
    const next = now + 24 * 3600 * 1000
    const fresh = signQuestToken({ v: 1, qid: 'ai-0000000a', cat: 'reuse', diff: 'easy', cid: CID, iat: next, exp: next + 1e6 }, ENV.QUEST_SIGNING_SECRET)
    expect(completeQuest({ token: fresh, clientId: CID, env: ENV, store, now: next }).status).toBe(200)
  })
  it('rejects forged, tampered, expired, missing and other-client tokens', async () => {
    const store = createCompletionStore()
    const token = await issue()
    const [body, sig] = token.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ v: 1, qid: 'ai-1', cat: 'repair', diff: 'hard', cid: CID, iat: Date.now(), exp: Date.now() + 1e6 })).toString('base64url')
    const wrongSecret = signQuestToken({ v: 1, qid: 'ai-2', cat: 'repair', diff: 'hard', cid: CID, iat: Date.now(), exp: Date.now() + 1e6 }, 'a-different-secret-entirely')
    for (const bad of [`${forgedPayload}.${sig}`, `${body}.AAAA`, wrongSecret, 'garbage', '', undefined, 42, `${body}x.${sig}`]) {
      expect(completeQuest({ token: bad, clientId: CID, env: ENV, store })).toEqual({ status: 403, body: { error: 'invalid_token' } })
    }
    expect(completeQuest({ token, clientId: 'someone-else-1', env: ENV, store }).status).toBe(403)
    expect(completeQuest({ token, clientId: CID, env: ENV, store, now: Date.now() + 25 * 3600 * 1000 }).status).toBe(403)
    expect(completeQuest({ token, clientId: '', env: ENV, store }).status).toBe(400)
  })
  it('works through the HTTP handler with action:complete', async () => {
    vi.stubGlobal('fetch', okFetch())
    const mk = (body, n) => ({ method: 'POST', body, headers: { 'x-forwarded-for': `grounding-${n}` }, socket: {} })
    const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, setHeader() {}, json(o) { this.body = o; return this } })
    const r1 = res()
    await handler(mk({ text: 'jar', clientId: 'handler-client-1' }, 1), r1, ENV)
    const r2 = res()
    await handler(mk({ action: 'complete', token: r1.body.token, clientId: 'handler-client-1' }, 2), r2, ENV)
    expect(r2.statusCode).toBe(200)
    expect(r2.body.reward).toEqual(rewardFor('reuse', 'easy'))
    const r3 = res()
    await handler(mk({ action: 'complete', token: r1.body.token, clientId: 'handler-client-1' }, 3), r3, ENV)
    expect(r3.statusCode).toBe(409)
    vi.unstubAllGlobals()
  })
})

describe('timeout and fallback', () => {
  it('shares one deadline constant: client waits 5s longer than the server', () => {
    expect(CLIENT_TIMEOUT_MS).toBe(UPSTREAM_TIMEOUT_MS + 5000)
  })
  it('returns a labelled prerecorded quest on timeout, never marked live', async () => {
    const hang = vi.fn((_u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const out = await gen({ timeoutMs: 10 }, hang)
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ kind: 'quest', fallback: true, live: false, source: 'prerecorded', fallback_label: 'Prerecorded tip, not a live AI result', fallback_reason: 'timeout', model: null })
    expect(out.body.quest.live).toBe(false)
    expect(out.body.quest.fallback_label).toBe('Prerecorded tip, not a live AI result')
    expect(out.body.token).toBeTruthy()
  })
  it('picks the same canned tip for the same input', () => {
    expect(pickFallback('jar', 5)).toEqual(pickFallback('jar', 5))
    expect(FALLBACK_QUESTS.length).toBeGreaterThanOrEqual(3)
    const picks = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((t) => pickFallback(t, 0).title))
    expect(picks.size).toBeGreaterThan(1)
  })
  it('live results carry live:true and fallback:false', async () => {
    const out = await gen()
    expect(out.body).toMatchObject({ live: true, fallback: false, source: 'live' })
    expect(out.body).not.toHaveProperty('fallback_label')
  })
})

describe('key hygiene', () => {
  it('never logs or returns the API key or upstream bodies', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ secret: 'UPSTREAM-BODY-LEAK' }) }))
    const out = await gen({}, fetchImpl)
    const logs = console.log.mock.calls.flat().join('\n')
    for (const text of [logs, JSON.stringify(out.body)]) {
      expect(text).not.toContain('sk-test-secret-key')
      expect(text).not.toContain('UPSTREAM-BODY-LEAK')
      expect(text).not.toContain(ENV.QUEST_SIGNING_SECRET)
    }
  })
})

describe('client helpers', () => {
  const json = (status, body) => vi.fn(async () => ({ ok: status < 300, status, json: async () => body }))
  it('requestEcoQuest returns kind clarify, and sends clarification, history, location', async () => {
    const fetchImpl = json(200, { kind: 'clarify', clarifying_question: 'Glass or plastic?', live: true })
    const res = await requestEcoQuest({ text: 'jar', clarification: 'x', history: [{ title: 't', category: 'reuse', completedAt: '2026-11-15' }], location: 'Austin, TX' }, { fetchImpl })
    expect(res).toEqual({ ok: true, kind: 'clarify', question: 'Glass or plastic?', live: true })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ clarification: 'x', constraints: { location: 'Austin, TX' }, history: [{ title: 't' }] })
  })
  it('requestEcoQuest keeps token, sources and fallback labelling; drops uncurated links', async () => {
    const server = await gen({ constraints: { location: 'Austin, TX' } }, okFetch({ ...base, category: 'recycle' }))
    const tampered = { ...server.body, quest: { ...server.body.quest, sources: [...server.body.quest.sources, { title: 'x', publisher: 'y', url: 'https://evil.example' }] } }
    const live = await requestEcoQuest({ text: 'jar' }, { fetchImpl: json(200, tampered) })
    expect(live).toMatchObject({ ok: true, kind: 'quest', live: true, fallback: false, source: 'live' })
    expect(live.quest.token).toBe(server.body.token)
    expect(live.quest.sources.every((s) => isCuratedUrl(s.url))).toBe(true)
    const canned = await gen({ timeoutMs: 1 }, vi.fn((_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(new Error('x'))))))
    const res = await requestEcoQuest({ text: 'jar' }, { fetchImpl: json(200, canned.body) })
    expect(res).toMatchObject({ live: false, fallback: true, source: 'prerecorded', fallbackLabel: 'Prerecorded tip, not a live AI result' })
    expect(res.quest.live).toBe(false)
  })
  it('completeEcoQuest returns the server reward only and maps errors', async () => {
    const quest = { token: 'tok' }
    expect(await completeEcoQuest(quest, { fetchImpl: json(200, { ok: true, reward: { xp: 8, coins: 13, leaves: 1 }, dailyUsed: 1, dailyMax: 3 }) }))
      .toEqual({ ok: true, reward: { xp: 8, coins: 13, leaves: 1 }, dailyUsed: 1, dailyMax: 3 })
    expect(await completeEcoQuest(quest, { fetchImpl: json(409, { error: 'already_completed' }) })).toEqual({ ok: false, code: 'already_completed', status: 409 })
    expect(await completeEcoQuest(quest, { fetchImpl: json(429, { error: 'daily_cap' }) })).toEqual({ ok: false, code: 'daily_cap', status: 429 })
    expect(await completeEcoQuest({}, { fetchImpl: json(200, {}) })).toMatchObject({ ok: false, code: 'invalid_token' })
    expect(await completeEcoQuest(quest, { fetchImpl: json(200, { ok: true, reward: 'big' }) })).toMatchObject({ ok: false })
  })
  it('buildBody bounds history and location; recentHistory builds from done quests', () => {
    const body = buildBody({ text: 'x', history: Array.from({ length: 9 }, (_, i) => ({ title: `t${i}` })), location: 'y'.repeat(100) })
    expect(body.history).toHaveLength(5)
    expect(body.constraints.location).toHaveLength(60)
    const game = { aiQuests: [{ status: 'done', title: 'A', category: 'reuse', completedAt: '2026-11-14' }, { status: 'open', title: 'B' }] }
    expect(recentHistory(game)).toEqual([{ title: 'A', category: 'reuse', completedAt: '2026-11-14' }])
  })
})
