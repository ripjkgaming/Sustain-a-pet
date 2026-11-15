import { describe, it, expect } from 'vitest'
import { sfx } from './sfx.js'

const names = ['tap', 'pop', 'open', 'close', 'select', 'complete', 'correct', 'wrong', 'streak', 'levelUp', 'claim', 'toggle']

describe('sfx', () => {
  it('is a safe no-op without AudioContext', () => {
    for (const n of names) expect(() => sfx[n]()).not.toThrow()
  })
  it('setMuted/isMuted work', () => {
    sfx.setMuted(true)
    expect(sfx.isMuted()).toBe(true)
    for (const n of names) expect(() => sfx[n]()).not.toThrow()
    sfx.setMuted(false)
    expect(sfx.isMuted()).toBe(false)
  })
})
