// Signed quest tokens (HMAC-SHA256). Files starting with "_" in api/ are helpers, not routes.
// The token carries only the quest id and reward bucket; the reward itself is recomputed from the fixed table.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

let ephemeralSecret = null

/**
 * QUEST_SIGNING_SECRET signs tokens. When unset (local dev), a random per-process secret is used:
 * tokens then stop working after a restart and do not work across serverless instances.
 * Set QUEST_SIGNING_SECRET (16+ characters) in any real deployment.
 */
export function signingSecret(env = process.env) {
  const configured = env.QUEST_SIGNING_SECRET
  if (typeof configured === 'string' && configured.length >= 16) return configured
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('hex')
    console.log('[eco-quest] QUEST_SIGNING_SECRET not set: using an ephemeral per-process secret')
  }
  return ephemeralSecret
}

const b64 = (buf) => Buffer.from(buf).toString('base64url')
const mac = (body, secret) => createHmac('sha256', secret).update(body).digest()

export function signQuestToken(payload, secret) {
  const body = b64(JSON.stringify(payload))
  return `${body}.${b64(mac(body, secret))}`
}

/** Returns the payload, or null when the token is malformed, forged or expired. */
export function verifyQuestToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1000) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = mac(body, secret)
  let given
  try { given = Buffer.from(sig, 'base64url') } catch { return null }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let payload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!payload || typeof payload !== 'object' || payload.v !== 1) return null
  if (typeof payload.qid !== 'string' || !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null
  if (now >= payload.exp) return null
  return payload
}
