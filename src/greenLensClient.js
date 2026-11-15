// GreenLens client: shrink a photo, ask /api/eco-quest for one quest, explain failures kindly.
import { MAX_AI_QUESTS_PER_DAY, pickServerFields, validateQuest } from './ecoQuest.js'
import { CLIENT_TIMEOUT_MS, FALLBACK_LABEL, MAX_HISTORY_ITEMS, MAX_LOCATION_CHARS, MAX_TEXT_CHARS } from './ecoQuestConfig.js'
import { clampReward } from './rewards.js'

export const ENDPOINT = '/api/eco-quest'
export const MAX_EDGE = 1024
export const JPEG_QUALITY = 0.82
export const MAX_TEXT = MAX_TEXT_CHARS
const CLIENT_ID_KEY = 'sustain-a-pet-client'

/** Scale (width, height) so the longest edge is at most `max`. Never upscales. */
export function fitWithin(width, height, max = MAX_EDGE) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

const unreadable = (message) => Object.assign(new Error(message), { code: 'image_unreadable' })

/** Decode an image File, draw it into a canvas no larger than MAX_EDGE, return a JPEG data URL. */
export async function downscaleImage(file, { max = MAX_EDGE, quality = JPEG_QUALITY } = {}) {
  if (!file || (file.type && !file.type.startsWith('image/'))) throw unreadable('not an image')
  let source
  try { source = await decode(file) } catch { throw unreadable('decode failed') }
  const { width, height } = fitWithin(source.width || source.naturalWidth, source.height || source.naturalHeight, max)
  if (!width) throw unreadable('empty image')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0, width, height)
  source.close?.()
  return canvas.toDataURL('image/jpeg', quality)
}

/** Stable random id for the server-side daily cap and duplicate checks. Falls back to a per-session id. */
let sessionId = null
export function getClientId() {
  try {
    const saved = window.localStorage.getItem(CLIENT_ID_KEY)
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved
  } catch { /* storage blocked */ }
  if (!sessionId) {
    const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16))
    sessionId = bytes ? Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
  try { window.localStorage.setItem(CLIENT_ID_KEY, sessionId) } catch { /* memory copy still works */ }
  return sessionId
}

/** Up to five most recently completed AI quests, shaped for the endpoint's `history` field. */
export function recentHistory(game, limit = MAX_HISTORY_ITEMS) {
  return (game?.aiQuests ?? [])
    .filter((q) => q.status === 'done')
    .slice(-limit)
    .map((q) => ({ title: q.title, category: q.category || 'other', completedAt: q.completedAt || q.createdOn || '' }))
    .filter((item) => /^\d{4}-\d{2}-\d{2}/.test(item.completedAt))
}

/** Request body for the endpoint; drops empty parts. Returns null when there is nothing to send. */
export function buildBody({ image, text, clarification, history, location, clientId } = {}) {
  const body = {}
  if (typeof image === 'string' && image.startsWith('data:image/')) body.image = image
  const note = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : ''
  if (note) body.text = note
  if (!body.image && !body.text) return null
  const answer = typeof clarification === 'string' ? clarification.trim().slice(0, MAX_TEXT) : ''
  if (answer) body.clarification = answer
  if (Array.isArray(history) && history.length) body.history = history.slice(-MAX_HISTORY_ITEMS)
  const place = typeof location === 'string' ? location.trim().slice(0, MAX_LOCATION_CHARS) : ''
  if (place) body.constraints = { location: place }
  if (typeof clientId === 'string' && clientId) body.clientId = clientId
  return body
}

const STATUS_CODES = { 400: 'bad_body', 403: 'invalid_token', 409: 'already_completed', 413: 'payload_too_large', 422: 'invalid_model_output', 429: 'rate_limited', 502: 'upstream_failed', 503: 'ai_unconfigured' }

function parseQuestReply(data, status) {
  if (data?.kind === 'clarify') {
    const question = typeof data.clarifying_question === 'string' ? data.clarifying_question.trim() : ''
    if (!question) return { ok: false, code: 'invalid_model_output', status }
    return { ok: true, kind: 'clarify', question, live: true }
  }
  const checked = validateQuest(data?.quest)
  if (!checked.ok) return { ok: false, code: 'invalid_model_output', status }
  const fallback = data.fallback === true
  const extras = pickServerFields({ ...data.quest, live: !fallback && data.live === true, token: data.token })
  const quest = { ...checked.quest, ...extras }
  if (fallback) quest.fallback_label = FALLBACK_LABEL // fixed copy: canned tips are never presented as live
  return {
    ok: true, kind: 'quest', quest, live: quest.live, fallback, source: fallback ? 'prerecorded' : 'live',
    fallbackLabel: fallback ? FALLBACK_LABEL : null, model: typeof data.model === 'string' ? data.model : null,
  }
}

/**
 * Ask the server to confirm a completion. Resolves { ok: true, reward, dailyUsed, dailyMax } or
 * { ok: false, code, status } with code invalid_token | already_completed | daily_cap | ...
 * Dispatch completeAiQuest with this server `reward` only; never with the quest's own xp.
 */
export async function completeEcoQuest(quest, { fetchImpl = globalThis.fetch, timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  if (!quest?.token) return { ok: false, code: 'invalid_token', status: 0 }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete', token: quest.token, clientId: getClientId() }),
      signal: controller.signal,
    })
    let data = null
    try { data = await res.json() } catch { /* non-JSON error page */ }
    if (!res.ok) {
      const code = typeof data?.error === 'string' && data.error ? data.error : STATUS_CODES[res.status] || 'upstream_failed'
      return { ok: false, code, status: res.status }
    }
    const reward = clampReward(data?.reward)
    if (!reward) return { ok: false, code: 'upstream_failed', status: res.status }
    return { ok: true, reward, dailyUsed: data.dailyUsed ?? null, dailyMax: data.dailyMax ?? null }
  } catch {
    return { ok: false, code: controller.signal.aborted ? 'timeout' : 'network', status: 0 }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * POST to the endpoint. Never throws. Resolves one of:
 *  { ok: true, kind: 'quest', quest, live, fallback, source, fallbackLabel, model }
 *  { ok: true, kind: 'clarify', question, live: true }
 *  { ok: false, code, status }
 * Input: { image, text, clarification, history, location }. The client id is added here.
 */
export async function requestEcoQuest(input, { fetchImpl = globalThis.fetch, signal, timeoutMs = CLIENT_TIMEOUT_MS } = {}) {
  const body = buildBody({ clientId: getClientId(), ...input })
  if (!body) return { ok: false, code: 'empty', status: 0 }
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener?.('abort', abort)
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let data = null
    try { data = await res.json() } catch { /* non-JSON error page */ }
    if (!res.ok) {
      const code = typeof data?.error === 'string' && data.error ? data.error : STATUS_CODES[res.status] || 'upstream_failed'
      return { ok: false, code, status: res.status }
    }
    return parseQuestReply(data, res.status)
  } catch {
    if (signal?.aborted) return { ok: false, code: 'aborted', status: 0 }
    if (timedOut) return { ok: false, code: 'timeout', status: 0 }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    return { ok: false, code: offline ? 'offline' : 'network', status: 0 }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', abort)
  }
}

/**
 * Friendly copy for a failure code.
 * fallback: suggest describing it in words. setup: server has no AI key, show setup steps. retry: same input may work later.
 */
export function describeError(code) {
  switch (code) {
    case 'ai_unconfigured':
      return { title: 'GreenLens is still asleep', body: 'This server has no AI key yet, so the lens can’t look at anything.', fallback: false, setup: true, retry: false }
    case 'rate_limited':
      return { title: 'Lots of looking!', body: 'GreenLens needs a short breather. Try again in about a minute.', fallback: false, setup: false, retry: true }
    case 'invalid_model_output':
      return { title: 'No safe quest in that one', body: 'GreenLens couldn’t turn that into a small, safe action. Try another angle, or tell it in words.', fallback: true, setup: false, retry: false }
    case 'image_unreadable':
      return { title: 'That photo wouldn’t open', body: 'Try a different photo, or describe what you see instead.', fallback: true, setup: false, retry: false }
    case 'payload_too_large':
    case 'bad_body':
      return { title: 'That photo didn’t come through', body: 'Try a different photo, or describe what you see instead.', fallback: true, setup: false, retry: false }
    case 'offline':
      return { title: 'You seem to be offline', body: 'GreenLens needs the internet to look around. The rest of your garden still works.', fallback: false, setup: false, retry: true }
    case 'timeout':
      return { title: 'That took too long', body: 'The lens got a little foggy. Try again, or describe it in words for a quicker answer.', fallback: true, setup: false, retry: true }
    case 'already_completed':
      return { title: 'Already counted', body: 'This quest has already earned its reward.', fallback: false, setup: false, retry: false }
    case 'daily_cap':
      return { title: 'Daily quest limit reached', body: 'You have earned the most AI quest rewards for today. Come back tomorrow.', fallback: false, setup: false, retry: false }
    case 'invalid_token':
      return { title: 'This quest expired', body: 'Ask GreenLens for a fresh quest to earn its reward.', fallback: true, setup: false, retry: false }
    case 'empty':
      return { title: 'Nothing to look at yet', body: 'Take a photo, or describe something near you.', fallback: true, setup: false, retry: false }
    default:
      return { title: 'The lens got foggy', body: 'GreenLens couldn’t reach its helper just now. Try again, or describe it in words.', fallback: true, setup: false, retry: true }
  }
}

/** Confidence badge copy. Medium and low always carry a caveat so uncertainty is never hidden. */
export function confidenceCopy(confidence, caveat) {
  const label = { high: 'Pretty sure', medium: 'Fairly sure', low: 'Just a guess' }[confidence] || 'Just a guess'
  const fallback = confidence === 'high' ? '' : 'GreenLens can misread things. Check this matches what is really in front of you.'
  return { label, note: caveat || fallback }
}

/** Completions used today against the shared daily cap. */
export function aiDailyUsed(game, today) {
  const daily = game?.aiDaily ?? { date: null, count: 0 }
  const used = daily.date === today ? daily.count : 0
  return { used, max: MAX_AI_QUESTS_PER_DAY, left: Math.max(0, MAX_AI_QUESTS_PER_DAY - used) }
}

/** Open quests newest first, plus the few most recently finished. */
export function aiQuestLists(game, recent = 3) {
  const list = game?.aiQuests ?? []
  return {
    open: list.filter((q) => q.status === 'open').reverse(),
    done: list.filter((q) => q.status === 'done').slice(-recent).reverse(),
  }
}

// ---------- UI helpers (pure; storage is injectable for tests) ----------
export const PRIVACY_KEY = 'sustain-pet-greenlens-privacy-v1'
export const PLACE_KEY = 'sustain-pet-greenlens-place'
export const PRIVACY_NOTICE = 'Your photo or note is sent to OpenRouter and the AI model it routes to, only to write your tip. Their privacy terms apply. Leave out faces, names and addresses.'

function browserStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

/** True once the player has acknowledged the AI privacy notice on this device. */
export function hasPrivacyAck(storage = browserStorage()) {
  try { return storage?.getItem(PRIVACY_KEY) === 'yes' } catch { return false }
}

/** Remember the acknowledgement. Returns false when storage is blocked (the screen still unlocks for this visit). */
export function savePrivacyAck(storage = browserStorage()) {
  try { storage?.setItem(PRIVACY_KEY, 'yes'); return !!storage } catch { return false }
}

/** Optional free-text town or region, used only to pick curated recycling links. */
export function loadPlace(storage = browserStorage()) {
  try { return (storage?.getItem(PLACE_KEY) || '').slice(0, MAX_LOCATION_CHARS) } catch { return '' }
}

export function savePlace(value, storage = browserStorage()) {
  const place = typeof value === 'string' ? value.trim().slice(0, MAX_LOCATION_CHARS) : ''
  try { if (place) storage?.setItem(PLACE_KEY, place); else storage?.removeItem(PLACE_KEY) } catch { /* not remembered */ }
  return place
}

/** Label for canned output, or null for a live AI result. Anything not explicitly live counts as prerecorded. */
export function fallbackBadge(quest) {
  if (!quest) return null
  if (quest.fallback_label) return quest.fallback_label
  return quest.live === false ? FALLBACK_LABEL : null
}

/** Recycling links (curated only) or the note explaining why there are none. */
export function sourcesView(quest) {
  const links = Array.isArray(quest?.sources) ? quest.sources.filter((s) => s && typeof s.url === 'string' && /^https:\/\//.test(s.url)) : []
  const note = links.length ? null : (typeof quest?.source_note === 'string' && quest.source_note) || null
  return { links, note }
}

/** Short, kind message for a rejected completion. */
export function completionNotice(code) {
  switch (code) {
    case 'already_completed': return 'This one already earned its reward. Nice work!'
    case 'daily_cap': return 'That’s today’s last GreenLens reward. Come back tomorrow for more.'
    case 'invalid_token': return 'This quest has expired. Ask GreenLens for a fresh one to earn a reward.'
    case 'rate_limited': return 'Lots of quests at once! Wait a minute, then try again.'
    case 'offline':
    case 'network':
    case 'timeout': return 'Couldn’t reach GreenLens just now. Try again in a moment.'
    default: return 'Couldn’t confirm that one just now. Try again in a moment.'
  }
}

/** Display reward for a quest before completion (table-derived xp), or the server reward after. */
export function rewardView(reward, xp) {
  if (reward && Number.isFinite(reward.xp)) return { xp: reward.xp, coins: reward.coins ?? reward.xp + 5, leaves: reward.leaves ?? 1 }
  const safe = Number.isFinite(xp) ? xp : 0
  return { xp: safe, coins: safe + 5, leaves: 1 }
}
