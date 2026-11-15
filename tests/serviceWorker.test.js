import { readFileSync, existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { cacheControlFor } from '../server/index.js'
import { registerServiceWorker } from '../src/pwa.jsx'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

describe('service worker setup', () => {
  it('sw-extra keep-list matches CACHE_VERSION in vite.config.js', () => {
    const version = /CACHE_VERSION = '([^']+)'/.exec(read('vite.config.js'))[1]
    const names = /CURRENT = \[(.*)\]/.exec(read('public/sw-extra.js'))[1]
    expect(names).toContain(`sustain-a-pet-pet-models-${version}`)
    expect(names).toContain(`sustain-a-pet-pet-textures-${version}`)
  })
  it('never routes /api to the service worker', () => {
    const cfg = read('vite.config.js')
    expect(cfg).toContain('navigateFallbackDenylist: [/^\\/api\\//]')
    expect(cfg).not.toMatch(/pathname\.startsWith\('\/api/)
  })
  it('manifest icons exist', () => {
    const m = JSON.parse(read('public/manifest.webmanifest'))
    for (const icon of m.icons) expect(existsSync(new URL(`../public${icon.src}`, import.meta.url))).toBe(true)
  })
  it('worker files revalidate on every load', () => {
    for (const p of ['/sw.js', '/sw-extra.js', '/manifest.webmanifest', '/index.html']) expect(cacheControlFor(p)).toBe('no-cache')
  })
  it('does not register outside production', () => {
    expect(registerServiceWorker({ PROD: false }, { serviceWorker: {} })).toBeNull()
    expect(registerServiceWorker({ PROD: true }, {})).toBeNull()
  })
})
