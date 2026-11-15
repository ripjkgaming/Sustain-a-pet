// In-memory per-IP token bucket. State resets on restart and is not shared across instances.

export function createRateLimiter({ max, windowMs, now = () => Date.now() }) {
  const refillPerMs = max / windowMs
  const buckets = new Map() // ip -> { tokens, at }

  const sweep = (t) => {
    for (const [ip, b] of buckets) {
      if (b.tokens + (t - b.at) * refillPerMs >= max) buckets.delete(ip)
    }
  }

  return {
    /** Returns { allowed: true } or { allowed: false, retryAfterSec }. */
    take(ip) {
      const t = now()
      if (buckets.size > 5000) sweep(t)
      const b = buckets.get(ip) ?? { tokens: max, at: t }
      b.tokens = Math.min(max, b.tokens + (t - b.at) * refillPerMs)
      b.at = t
      if (b.tokens >= 1) {
        b.tokens -= 1
        buckets.set(ip, b)
        return { allowed: true }
      }
      buckets.set(ip, b)
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / refillPerMs / 1000)) }
    },
    size: () => buckets.size,
  }
}
