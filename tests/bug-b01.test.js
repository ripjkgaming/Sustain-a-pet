import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../server/config.js'
import { createApp } from '../server/index.js'

const dist = mkdtempSync(join(tmpdir(), 'sap-b01-'))
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title>')

function start(extra) {
  const env = { AI_MOCK: '1', DIST_DIR: dist, PORT: '0', RATE_LIMIT_MAX: '2', ...extra }
  const app = createApp(loadConfig(env), { env, log: () => {} })
  return new Promise((resolve) => app.server.listen(0, '127.0.0.1', () => {
    resolve({ app, base: `http://127.0.0.1:${app.server.address().port}` })
  }))
}
const post = (base, xff) => fetch(`${base}/api/eco-quest`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff },
  body: JSON.stringify({ text: 'bottle' }),
})

describe('TRUST_PROXY client IP', () => {
  it('ignores spoofed leftmost X-Forwarded-For entries', async () => {
    const s = await start({ TRUST_PROXY: '1' })
    try {
      const statuses = []
      for (let i = 0; i < 4; i++) statuses.push((await post(s.base, `spoof-${i}, 203.0.113.9`)).status)
      expect(statuses.slice(0, 2)).toEqual([200, 200])
      expect(statuses.slice(2)).toEqual([429, 429])
    } finally { await s.app.close() }
  })
})
