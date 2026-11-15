import { describe, expect, it } from 'vitest'
import { sceneLayout } from '../src/sceneLayout.js'

describe('sceneLayout', () => {
  it('is safe with no pet / no game', () => {
    expect(sceneLayout(undefined)).toEqual({ count: 0, home: 0 })
    expect(sceneLayout(null)).toEqual({ count: 0, home: 0 })
    expect(sceneLayout({})).toEqual({ count: 0, home: 0 })
  })
  it('derives count and home index', () => {
    expect(sceneLayout({ areas: ['a', 'b', 'c'], activeArea: 'b' })).toEqual({ count: 3, home: 1 })
  })
  it('falls back to 0 when active area is unknown', () => {
    expect(sceneLayout({ areas: ['a'], activeArea: 'z' })).toEqual({ count: 1, home: 0 })
  })
})
