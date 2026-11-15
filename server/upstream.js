// Upstream AI access for the production server: bounded retries with backoff, and a test-only mock.

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'))
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
  const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new Error('aborted')) }
  signal?.addEventListener('abort', onAbort, { once: true })
})

const retryableStatus = (status) => status === 429 || status >= 500

/**
 * Wraps fetch for ONE request. Retries only network errors, 429 and 5xx, at most `maxRetries` times in total
 * (shared across the model chain), with exponential backoff and full jitter. It never sleeps past
 * `deadlineAt`, the end of the upstream budget, so retries cannot extend the upstream timeout.
 */
export function createRetryingFetch({
  fetchImpl = globalThis.fetch, maxRetries = 2, baseMs = 400, capMs = 4000, deadlineAt,
  random = Math.random, wait = sleep, now = () => Date.now(), onRetry = () => {},
}) {
  let used = 0
  return async function retryingFetch(url, init = {}) {
    for (;;) {
      let response
      let error
      try {
        response = await fetchImpl(url, init)
      } catch (err) {
        if (init.signal?.aborted) throw err
        error = err
      }
      if (response && !retryableStatus(response.status)) return response
      if (used >= maxRetries) {
        if (error) throw error
        return response
      }
      const delay = Math.floor(random() * Math.min(capMs, baseMs * 2 ** used))
      if (deadlineAt !== undefined && now() + delay >= deadlineAt) {
        if (error) throw error
        return response
      }
      used += 1
      onRetry({ attempt: used, reason: error ? 'network' : response.status, delay })
      await wait(delay, init.signal)
    }
  }
}

// ---- Test-only mock upstream (AI_MOCK=1). loadConfig() refuses it when NODE_ENV=production. ----
// The mock answers like OpenRouter chat completions. Triggers in the user note:
//   "mock:500" -> HTTP 500 on every call, "mock:429" -> HTTP 429, "mock:hang" -> never answers (until aborted).
const MOCK_QUEST = {
  clarifying_question: null,
  object: 'plastic water bottle',
  title: 'Refill, do not rebuy',
  action: 'Refill a reusable bottle from the tap today.',
  why: 'Single-use bottles add plastic waste.',
  category: 'reuse',
  difficulty: 'easy',
  confidence: 'high',
  caveat: null,
  personalization_note: null,
}

export function createMockFetch() {
  return async function mockFetch(_url, init = {}) {
    const body = typeof init.body === 'string' ? init.body : ''
    const status = body.includes('mock:500') ? 500 : body.includes('mock:429') ? 429 : 0
    if (body.includes('mock:hang')) {
      await new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal.reason ?? new Error('aborted')), { once: true })
      })
    }
    if (status) return { ok: false, status, json: async () => ({ error: 'mock_upstream_error' }) }
    return {
      ok: true,
      status: 200,
      json: async () => ({ model: 'mock-model', choices: [{ message: { role: 'assistant', content: JSON.stringify(MOCK_QUEST) } }] }),
    }
  }
}

/** Point the upstream URL at AI_BASE_URL (a local stub). Test-only, same guard as the mock. */
export function withBaseUrl(fetchImpl, baseUrl) {
  if (!baseUrl) return fetchImpl
  return (_url, init) => fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, init)
}
