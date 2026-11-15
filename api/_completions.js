// Completion ledger: one completion per quest per client, and a daily cap per client.
// DEMO LIMITATION: in memory per server instance. It resets on restart and is not shared across serverless
// instances; use a shared store (KV/Redis/DB) before relying on it. clientId is client-chosen, so a user who
// clears their id gets a fresh cap: this limits honest overuse and casual farming, not a determined attacker.
export function createCompletionStore() {
  const completed = new Map() // key -> { exp, replay }
  const daily = new Map() // `${clientId}|${day}` -> count
  return {
    has: (key) => completed.has(key),
    get: (key) => completed.get(key)?.replay,
    count: (clientId, day) => daily.get(`${clientId}|${day}`) ?? 0,
    record(key, expiresAt, clientId, day, now, replay) {
      if (completed.size > 5000) {
        for (const [k, v] of completed) if (v.exp <= now) completed.delete(k)
        for (const k of daily.keys()) if (!k.endsWith(`|${day}`)) daily.delete(k)
      }
      completed.set(key, { exp: expiresAt, replay })
      const dayKey = `${clientId}|${day}`
      daily.set(dayKey, (daily.get(dayKey) ?? 0) + 1)
    },
    clear() { completed.clear(); daily.clear() },
  }
}

export const completionStore = createCompletionStore()
