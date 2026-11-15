import { describe, it, expect } from 'vitest'
import { reduce } from '../src/store.js'

const empty = { real: null, events: [], awayDays: 0, nonce: 0 }
const hatched = () => reduce(empty, { type: 'hatch', name: '  Pip  ', sprite: 'mossy' })
const types = (app) => app.events.map((e) => e.type)

describe('store reducer', () => {
  it('hatch trims and caps name at 20, keeps sprite', () => {
    const a = reduce(empty, { type: 'hatch', name: 'x'.repeat(40), sprite: 'sunbud' })
    expect(a.real.pet.name).toHaveLength(20)
    expect(a.real.pet.sprite).toBe('sunbud')
  })
  it('tick emits a tick event with xp, and a repeat emits nothing new', () => {
    const a = reduce(hatched(), { type: 'tick', id: 'walk' })
    expect(types(a)).toContain('tick')
    expect(a.events[0].xp).toBe(15)
    const b = reduce(a, { type: 'tick', id: 'walk' })
    expect(b).toBe(a)
  })
})
