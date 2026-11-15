// Production server configuration, read from environment variables only.
// Every variable is documented in .env.example and docs/PROD_VALIDATION.md.
//
// TIMEOUT ORDERING (longest to shortest). Each layer must outlive the one below it,
// so the inner layer fails first and the outer layer can still report it:
//
//   client fetch timeout (45 s)  >  server request timeout (40 s)  >  upstream AI timeout (30 s)
//
// - Upstream (30 s) is one deadline shared by every model attempt and every retry.
// - Server (40 s) covers the whole API request. If it fires, the client gets JSON 504.
// - Client (45 s) is CLIENT_TIMEOUT_MS in src/ecoQuestConfig.js (used by src/greenLensClient.js) and must stay above SERVER_TIMEOUT_MS.
// loadConfig() throws when the server and upstream values break this ordering.

import { CLIENT_TIMEOUT_MS } from '../src/ecoQuestConfig.js'

export { CLIENT_TIMEOUT_MS }

const int = (env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}

const flag = (env, name) => ['1', 'true', 'yes'].includes(String(env[name] ?? '').toLowerCase())

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production'
  const mock = flag(env, 'AI_MOCK')
  const aiBaseUrl = env.AI_BASE_URL?.trim() || ''

  // Mock mode and a custom upstream exist for tests only. Refuse to start in production.
  if (production && (mock || aiBaseUrl)) {
    throw new Error('AI_MOCK and AI_BASE_URL are test-only and are refused when NODE_ENV=production')
  }

  const config = {
    production,
    mock,
    aiBaseUrl,
    port: int(env, 'PORT', 8080, { min: 0, max: 65535 }),
    host: env.HOST?.trim() || '0.0.0.0',
    distDir: env.DIST_DIR?.trim() || new URL('../dist', import.meta.url).pathname,
    // Largest accepted request body. The client sends one JPEG scaled to 1024 px (usually under 1 MB),
    // and the handler accepts images up to 3.5 MB (4.7 MB as base64). 6 MB leaves room for JSON fields.
    maxBodyBytes: int(env, 'MAX_BODY_BYTES', 6 * 1024 * 1024, { min: 1024, max: 64 * 1024 * 1024 }),
    // Per-IP token bucket: RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS (burst = RATE_LIMIT_MAX).
    rateLimitMax: int(env, 'RATE_LIMIT_MAX', 10, { min: 1 }),
    rateLimitWindowMs: int(env, 'RATE_LIMIT_WINDOW_MS', 60_000, { min: 1000 }),
    // Only trust X-Forwarded-For when a proxy you control sets it.
    trustProxy: flag(env, 'TRUST_PROXY'),
    serverTimeoutMs: int(env, 'SERVER_TIMEOUT_MS', 40_000, { min: 1000 }),
    upstreamTimeoutMs: int(env, 'UPSTREAM_TIMEOUT_MS', 30_000, { min: 1000 }),
    upstreamMaxRetries: int(env, 'UPSTREAM_MAX_RETRIES', 2, { min: 0, max: 2 }),
    upstreamRetryBaseMs: int(env, 'UPSTREAM_RETRY_BASE_MS', 400, { min: 1, max: 10_000 }),
    shutdownTimeoutMs: int(env, 'SHUTDOWN_TIMEOUT_MS', 10_000, { min: 0 }),
  }

  if (config.upstreamTimeoutMs >= config.serverTimeoutMs) {
    throw new Error('UPSTREAM_TIMEOUT_MS must be lower than SERVER_TIMEOUT_MS')
  }
  if (config.serverTimeoutMs >= CLIENT_TIMEOUT_MS) {
    throw new Error(`SERVER_TIMEOUT_MS must be lower than the client timeout (${CLIENT_TIMEOUT_MS} ms)`)
  }
  return config
}

/** Names (never values) of required configuration that is missing. */
export function missingConfig(config, env = process.env) {
  const missing = []
  if (!config.mock && !env.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY')
  return missing
}
