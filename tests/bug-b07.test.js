import { afterEach, describe, expect, it, vi } from 'vitest'
import { createState } from '../src/engine.js'
import { reduce, todayOf } from '../src/store.js'

describe('clock set behind lastOpenDate', () => {
  afterEach(() => vi.useRealTimers())

  it('keeps actions working on the saved day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 10, 12))
    const real = createState('Pip', '2026-11-16')
    const app = { real, events: [], awayDays: 0, nonce: 0 }
    expect(todayOf(app)).toBe('2026-11-16')
    const next = reduce(app, { type: 'tick', id: 'walk' })
    const ticked = next.real.days['2026-11-16']?.habits ?? []
    expect(ticked.length).toBe(1)
    expect(next.real.xp).toBeGreaterThan(real.xp)
  })

  it('uses real date when it is later', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 20, 12))
    const real = createState('Pip', '2026-11-16')
    expect(todayOf({ real })).toBe('2026-11-20')
  })
})
