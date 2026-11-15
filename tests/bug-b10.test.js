import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { footfallsBetween } from '../src/walkingAudio.js'

describe('LeafFootsteps mute', () => {
  it('footfallsBetween yields nothing when disabled', () => {
    expect(footfallsBetween(0, 3, { enabled: false, visible: true, moving: true, unlocked: true })).toBe(0)
  })
  it('component consults sfx.isMuted for gating', () => {
    const src = readFileSync(new URL('../src/components/LeafFootsteps.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/from '\.\.\/sfx\.js'/)
    expect(src).toMatch(/enabled: audible/)
    expect(src.match(/sfx\.isMuted\(\)/g).length).toBeGreaterThanOrEqual(2)
  })
})
