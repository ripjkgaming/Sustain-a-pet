// GreenLens client: shrink a photo, ask /api/eco-quest for one quest, explain failures kindly.
import { MAX_AI_QUESTS_PER_DAY, validateQuest } from './ecoQuest.js'

export const ENDPOINT = '/api/eco-quest'
export const MAX_EDGE = 1024
export const JPEG_QUALITY = 0.82
export const MAX_TEXT = 200
const TIMEOUT_MS = 25000

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

/** Request body for the endpoint; drops empty parts. Returns null when there is nothing to send. */
export function buildBody({ image, text } = {}) {
  const body = {}
  if (typeof image === 'string' && image.startsWith('data:image/')) body.image = image
  const note = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT) : ''
  if (note) body.text = note
  return body.image || body.text ? body : null
}

const STATUS_CODES = { 400: 'bad_body', 413: 'payload_too_large', 422: 'invalid_model_output', 429: 'rate_limited', 502: 'upstream_failed', 503: 'ai_unconfigured' }

/** POST to the endpoint. Resolves { ok: true, quest } or { ok: false, code, status }; never throws. */
export async function requestEcoQuest(input, { fetchImpl = globalThis.fetch, signal, timeoutMs = TIMEOUT_MS } = {}) {
  const body = buildBody(input)
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
    const checked = validateQuest(data?.quest)
    if (!checked.ok) return { ok: false, code: 'invalid_model_output', status: res.status }
    return { ok: true, quest: checked.quest }
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
