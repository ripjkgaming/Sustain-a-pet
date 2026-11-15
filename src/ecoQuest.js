// Shared AI eco-quest contract: schema for the model, validation for model output and stored quests.
// Rewards are never read from the model: xp is derived from category and difficulty by src/rewards.js.
import { rewardFor, normalizeCategory, normalizeDifficulty, CATEGORIES, DIFFICULTIES } from './rewards.js'
import { isCuratedUrl } from './recyclingSources.js'

export const MAX_AI_QUESTS_PER_DAY = 3

const LIMITS = { object: 60, title: 80, action: 200, why: 300, caveat: 160, personalization_note: 160 }
const REQUIRED = ['object', 'title', 'action', 'why']
const CONFIDENCE = ['high', 'medium', 'low']
const QUESTION_MAX = 160

// Small denylist: quests must never suggest harmful or unsafe actions.
const DENY = [
  /\bbleach\b/i, /\bpoison(ing|ous)?\b/i, /\bingest(ion)?\b/i, /\bswallow(ing)?\b/i,
  /\belectrocut\w*/i, /\bexplosi(ve|ves)\b/i, /\bweapon\w*/i, /\bsuicid\w*/i,
  /\bself-harm\b/i, /\bdrown\w*/i, /\btrespass\w*/i,
]

// JSON schema sent to the model (strict). Flat on purpose: free vision models handle anyOf poorly.
// Either clarifying_question is a string (quest text fields empty) or it is null and the quest is filled.
// No id, xp, coins, url or source fields: the server owns those.
export const QUEST_SCHEMA = {
  type: 'object',
  properties: {
    clarifying_question: { type: ['string', 'null'] },
    object: { type: 'string' },
    title: { type: 'string' },
    action: { type: 'string' },
    why: { type: 'string' },
    category: { type: 'string', enum: CATEGORIES },
    difficulty: { type: 'string', enum: DIFFICULTIES },
    confidence: { type: 'string', enum: CONFIDENCE },
    caveat: { type: ['string', 'null'] },
    personalization_note: { type: ['string', 'null'] },
  },
  required: ['clarifying_question', 'object', 'title', 'action', 'why', 'category', 'difficulty', 'confidence', 'caveat', 'personalization_note'],
  additionalProperties: false,
}

/** Plain-language confidence label, derived in code from the confidence value. Always returned. */
export function confidenceLabel(confidence) {
  switch (confidence) {
    case 'high': return 'High confidence: the photo and note looked clear.'
    case 'medium': return 'Medium confidence: check this matches what you have.'
    default: return 'Low confidence: this may be a guess, so double-check first.'
  }
}

// FNV-1a 32-bit hash, rendered as 8 hex chars.
function fnv1a(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// Strip tags, collapse whitespace, trim, cap length.
export function clean(value, max) {
  return value.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

// The model never supplies links: sources come from src/recyclingSources.js.
const stripUrls = (value) => value.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')

/** Exactly one short question: cut at the first '?', drop denied content. Returns '' when unusable. */
function oneQuestion(value) {
  if (typeof value !== 'string') return ''
  let text = clean(stripUrls(value), 400)
  if (!text) return ''
  const cut = text.indexOf('?')
  if (cut !== -1) text = text.slice(0, cut + 1)
  text = text.slice(0, QUESTION_MAX).trim()
  if (!text || DENY.some((re) => re.test(text))) return ''
  return text.endsWith('?') ? text : `${text.replace(/[.!]+$/, '')}?`
}

/**
 * Validate and normalize model output or a stored quest.
 * Returns { ok: true, kind: 'quest', quest } | { ok: true, kind: 'clarify', question } | { ok: false, error }.
 * Pass allowClarify only when the server may still ask a question (no clarification answer yet).
 * Any xp/coins/reward the input carries is ignored; xp comes from the deterministic reward table.
 */
export function validateQuest(raw, { allowClarify = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not-object' }

  if (allowClarify) {
    const question = oneQuestion(raw.clarifying_question)
    if (question) return { ok: true, kind: 'clarify', question }
  }

  const text = {}
  for (const field of Object.keys(LIMITS)) {
    const value = raw[field]
    if (value === undefined || value === null) {
      if (REQUIRED.includes(field)) return { ok: false, error: `empty:${field}` }
      continue
    }
    if (typeof value !== 'string') return { ok: false, error: `bad-type:${field}` }
    text[field] = clean(stripUrls(value), LIMITS[field])
    if (!text[field] && REQUIRED.includes(field)) return { ok: false, error: `empty:${field}` }
  }

  for (const field of Object.keys(text)) {
    if (DENY.some((re) => re.test(text[field]))) return { ok: false, error: 'denied-content' }
  }

  if (!CONFIDENCE.includes(raw.confidence)) return { ok: false, error: 'bad-type:confidence' }

  const category = normalizeCategory(raw.category)
  const difficulty = normalizeDifficulty(raw.difficulty)
  const quest = {
    id: `ai-${fnv1a(`${text.title}\n${text.action}`)}`,
    object: text.object,
    title: text.title,
    action: text.action,
    why: text.why,
    category,
    difficulty,
    xp: rewardFor(category, difficulty).xp,
    confidence: raw.confidence,
    confidence_label: confidenceLabel(raw.confidence),
  }
  if (text.caveat) quest.caveat = text.caveat
  if (text.personalization_note) quest.personalization_note = text.personalization_note
  return { ok: true, kind: 'quest', quest }
}

/**
 * Server-supplied extras that may travel with a stored quest. Anything else is dropped.
 * Sources are kept only when the URL is in the curated list, so a tampered store cannot add links.
 */
export function pickServerFields(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  if (typeof raw.token === 'string' && raw.token.length <= 1000) out.token = raw.token
  if (typeof raw.live === 'boolean') out.live = raw.live
  if (typeof raw.fallback_label === 'string') out.fallback_label = clean(raw.fallback_label, 80)
  if (typeof raw.source_note === 'string') out.source_note = clean(raw.source_note, 120)
  out.sources = Array.isArray(raw.sources)
    ? raw.sources
      .filter((s) => s && isCuratedUrl(s.url) && typeof s.title === 'string' && typeof s.publisher === 'string')
      .slice(0, 4)
      .map((s) => ({ title: clean(s.title, 80), publisher: clean(s.publisher, 80), url: s.url }))
    : []
  return out
}
