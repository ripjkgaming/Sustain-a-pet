import { mkdtempSync, writeFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import { afterAll, describe, expect, it } from 'vitest'
import { loadConfig } from '../server/config.js'
import { createApp } from '../server/index.js'

const dir = mkdtempSync(join(tmpdir(), 'b02-'))
writeFileSync(join(dir, 'index.html'), '<html></html>')
const big = join(dir, 'big.mp3')
writeFileSync(big, Buffer.alloc(8 * 1024 * 1024, 1))

const openFds = () => readdirSync('/proc/self/fd').filter((fd) => {
  try { return readlinkSync(`/proc/self/fd/${fd}`) === big } catch { return false }
}).length

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('static file stream', () => {
  it.skipIf(process.platform !== 'linux')('closes file fd when client aborts download', async () => {
    const config = loadConfig({ AI_MOCK: '1', DIST_DIR: dir })
    const app = createApp(config, { log: () => {} })
    await new Promise((r) => app.server.listen(0, '127.0.0.1', r))
    const { port } = app.server.address()
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => {
        const s = net.connect(port, '127.0.0.1', () => s.write('GET /big.mp3 HTTP/1.1\r\nHost: x\r\n\r\n'))
        s.once('data', () => { s.destroy(); resolve() })
      })
    }
    await new Promise((r) => setTimeout(r, 300))
    expect(openFds()).toBe(0)
    await new Promise((r) => app.server.close(r))
  })
})
