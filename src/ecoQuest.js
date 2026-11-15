// Shared AI eco-quest contract: schema for the model, validation for stored quests.
export const MAX_AI_QUESTS_PER_DAY = 3

const LIMITS = { object: 60, title: 80, action: 200, why: 300, caveat: 160 }
const REQUIRED = ['object', 'title', 'action', 'why']
const CONFIDENCE = ['high', 'medium', 'low']
const XP_MIN = 5
const XP_MAX = 15

// Small denylist: quests must never suggest harmful or unsafe actions.
const DENY = [
  /\bbleach\b/i, /\bpoison(ing|ous)?\b/i, /\bingest(ion)?\b/i, /\bswallow(ing)?\b/i,
  /\belectrocut\w*/i, /\bexplosi(ve|ves)\b/i, /\bweapon\w*/i, /\bsuicid\w*/i,
  /\bself-harm\b/i, /\bdrown\w*/i, /\btrespass\w*/i,
]

// JSON schema sent to the model as response_format json_schema (strict). No id field.
export const QUEST_SCHEMA = {
  type: 'object',
  properties: {
    object: { type: 'string' },
    title: { type: 'string' },
    action: { type: 'string' },
    why: { type: 'string' },
    xp: { type: 'integer', minimum: XP_MIN, maximum: XP_MAX },
    confidence: { type: 'string', enum: CONFIDENCE },
    caveat: { type: ['string', 'null'] },
  },
  // Strict json_schema: every property required, no extra keys. caveat may be null.
  required: ['object', 'title', 'action', 'why', 'xp', 'confidence', 'caveat'],
  additionalProperties: false,
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
function clean(value, max) {
  return value.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/**
 * Validate and normalize a quest from the model or storage.
 * Returns { ok: true, quest } or { ok: false, error } with a kebab-case code.
 */
export function validateQuest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'not-object' }

  const text = {}
  for (const field of Object.keys(LIMITS)) {
    const value = raw[field]
    if (value === undefined || value === null) {
      if (REQUIRED.includes(field)) return { ok: false, error: `empty:${field}` }
      continue
    }
    if (typeof value !== 'string') return { ok: false, error: `bad-type:${field}` }
    text[field] = clean(value, LIMITS[field])
    if (!text[field] && REQUIRED.includes(field)) return { ok: false, error: `empty:${field}` }
  }

  for (const field of Object.keys(text)) {
    if (DENY.some((re) => re.test(text[field]))) return { ok: false, error: 'denied-content' }
  }

  if (typeof raw.xp !== 'number' || !Number.isFinite(raw.xp)) return { ok: false, error: 'bad-type:xp' }
  if (!CONFIDENCE.includes(raw.confidence)) return { ok: false, error: 'bad-type:confidence' }

  const xp = Math.min(XP_MAX, Math.max(XP_MIN, Math.round(raw.xp)))
  const quest = {
    id: `ai-${fnv1a(`${text.title}\n${text.action}`)}`,
    object: text.object,
    title: text.title,
    action: text.action,
    why: text.why,
    xp,
    confidence: raw.confidence,
  }
  if (text.caveat) quest.caveat = text.caveat
  return { ok: true, quest }
}
