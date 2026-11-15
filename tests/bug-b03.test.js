import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../server/config.js'

describe('B03 distDir default', () => {
  it('is a decoded filesystem path, not a percent-encoded URL pathname', () => {
    const { distDir } = loadConfig({})
    expect(distDir).toBe(fileURLToPath(new URL('../dist', import.meta.url)))
    expect(distDir).not.toMatch(/%[0-9A-Fa-f]{2}/)
  })

  it('honours DIST_DIR override', () => {
    expect(loadConfig({ DIST_DIR: '/tmp/my app/dist' }).distDir).toBe('/tmp/my app/dist')
  })
})
