import { describe, it, expect } from 'vitest'
import {
  ISLAND_R, RIVER, SPACING, BRIDGE_W, islandCenter, bridgeSpan, islandAt, isWalkable, clampToWalkable, routeTo, randomSpot,
} from './islands.js'

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

function assertLegsWalkable(from, path, count) {
  let prev = from
  for (const p of path) {
    for (let k = 0; k <= 40; k++) {
      const t = k / 40
      const x = prev.x + (p.x - prev.x) * t, z = prev.z + (p.z - prev.z) * t
      expect(isWalkable(x, z, count), `(${x.toFixed(2)}, ${z.toFixed(2)}) in water`).toBe(true)
    }
    prev = p
  }
}

describe('geometry', () => {
  it('lays islands out along -z', () => {
    expect(SPACING).toBeCloseTo(2 * ISLAND_R + RIVER)
    expect(islandCenter(0).z).toBeCloseTo(0)
    expect(islandCenter(2).z).toBeCloseTo(-2 * SPACING)
    const b = bridgeSpan(0)
    expect(b.z0).toBeCloseTo(-ISLAND_R)
    expect(b.z1).toBeCloseTo(-SPACING + ISLAND_R)
    expect(b.z0).toBeGreaterThan(b.z1)
    expect(b.z0 - b.z1).toBeCloseTo(RIVER)
  })
})

describe('islandAt / isWalkable', () => {
  it('finds the island under a point', () => {
    expect(islandAt(0, 0, 3)).toBe(0)
    expect(islandAt(1, -SPACING + 1, 3)).toBe(1)
    expect(islandAt(0, -2 * SPACING, 3)).toBe(2)
  })
  it('ignores locked islands', () => {
    expect(islandAt(0, -SPACING, 1)).toBe(-1)
    expect(isWalkable(0, -SPACING, 1)).toBe(false)
    expect(isWalkable(0, -SPACING, 2)).toBe(true)
  })
  it('river is water', () => {
    expect(isWalkable(BRIDGE_W, -SPACING / 2, 2)).toBe(false)
    expect(isWalkable(ISLAND_R + 0.5, 0, 3)).toBe(false)
    expect(isWalkable(2, -ISLAND_R - 0.5, 3)).toBe(false)
  })
  it('bridge only walkable when both islands unlocked', () => {
    const mid = -SPACING / 2
    expect(isWalkable(0, mid, 1)).toBe(false)
    expect(isWalkable(0, mid, 2)).toBe(true)
    const mid2 = -1.5 * SPACING
    expect(isWalkable(0, mid2, 2)).toBe(false)
    expect(isWalkable(0, mid2, 3)).toBe(true)
  })
  it('bridge is BRIDGE_W wide', () => {
    const mid = -SPACING / 2
    expect(isWalkable(BRIDGE_W / 2 - 0.01, mid, 2)).toBe(true)
    expect(isWalkable(BRIDGE_W / 2 + 0.05, mid, 2)).toBe(false)
  })
})

describe('clampToWalkable', () => {
  it('keeps walkable points', () => {
    expect(clampToWalkable(1, -1, 2)).toEqual({ x: 1, z: -1 })
  })
  it('pulls water points onto ground', () => {
    const rand = seeded(7)
    for (let n = 0; n < 300; n++) {
      const count = 1 + Math.floor(rand() * 3)
      const x = (rand() - 0.5) * 20, z = 5 - rand() * 30
      const c = clampToWalkable(x, z, count)
      expect(isWalkable(c.x, c.z, count)).toBe(true)
    }
  })
  it('clamps the locked island back to the river bank', () => {
    const c = clampToWalkable(0, -SPACING, 1)
    expect(c.z).toBeCloseTo(-ISLAND_R)
    expect(isWalkable(c.x, c.z, 1)).toBe(true)
  })
  it('clamps river points to the nearest bridge or bank', () => {
    const c = clampToWalkable(3, -SPACING / 2, 2)
    expect(isWalkable(c.x, c.z, 2)).toBe(true)
    expect(Math.abs(c.x)).toBeLessThanOrEqual(BRIDGE_W / 2 + 1e-6)
  })
  it('never lands in water when count is 0', () => {
    const c = clampToWalkable(9, 9, 0)
    expect(isWalkable(c.x, c.z, 1)).toBe(true)
  })
})

describe('routeTo', () => {
  it('goes straight on the same island', () => {
    expect(routeTo({ x: 0, z: 0 }, { x: 1, z: 1 }, 3)).toEqual([{ x: 1, z: 1 }])
  })
  it('crosses via bridge ends', () => {
    const to = { x: 1, z: -SPACING + 1 }
    const path = routeTo({ x: 0, z: 0.5 }, to, 2)
    expect(path.length).toBe(3)
    expect(path[0]).toEqual({ x: 0, z: bridgeSpan(0).z0 })
    expect(path[1]).toEqual({ x: 0, z: bridgeSpan(0).z1 })
    expect(path[2]).toEqual(to)
  })
  it('crosses two bridges and back', () => {
    const a = { x: 0.5, z: 0.5 }, b = { x: -1, z: -2 * SPACING + 1 }
    const there = routeTo(a, b, 3)
    expect(there.length).toBe(5)
    assertLegsWalkable(a, there, 3)
    const back = routeTo(b, a, 3)
    expect(back.length).toBe(5)
    assertLegsWalkable(b, back, 3)
  })
  it('never passes through water for random start/target pairs', () => {
    const rand = seeded(42)
    for (let n = 0; n < 400; n++) {
      const count = 1 + Math.floor(rand() * 3)
      const from = clampToWalkable((rand() - 0.5) * 12, 4 - rand() * 28, count)
      const raw = { x: (rand() - 0.5) * 12, z: 4 - rand() * 28 }
      const path = routeTo(from, raw, count)
      const end = path[path.length - 1]
      expect(isWalkable(end.x, end.z, count)).toBe(true)
      assertLegsWalkable(from, path, count)
    }
  })
  it('handles starting and ending on a bridge', () => {
    const onBridge = { x: 0.2, z: -SPACING / 2 }
    const other = { x: 0.1, z: -SPACING / 2 - 1 }
    expect(routeTo(onBridge, other, 2)).toEqual([other])
    assertLegsWalkable(onBridge, routeTo(onBridge, { x: 0, z: -SPACING }, 2), 2)
    assertLegsWalkable(onBridge, routeTo(onBridge, { x: 0, z: 0 }, 2), 2)
    assertLegsWalkable({ x: 0, z: 0 }, routeTo({ x: 0, z: 0 }, onBridge, 2), 2)
    const a = { x: 0, z: -SPACING / 2 }
    assertLegsWalkable(a, routeTo(a, { x: 0, z: -1.5 * SPACING }, 3), 3)
  })
  it('clamps a target on a locked island', () => {
    const path = routeTo({ x: 0, z: 0 }, { x: 0, z: -SPACING }, 1)
    const end = path[path.length - 1]
    expect(isWalkable(end.x, end.z, 1)).toBe(true)
    assertLegsWalkable({ x: 0, z: 0 }, path, 1)
  })
})

describe('randomSpot', () => {
  it('lies on island i, 1..ISLAND_R-1.2 from the centre', () => {
    const rand = seeded(3)
    for (let i = 0; i < 3; i++) {
      const c = islandCenter(i)
      for (let n = 0; n < 100; n++) {
        const p = randomSpot(i, rand)
        const d = Math.hypot(p.x - c.x, p.z - c.z)
        expect(d).toBeGreaterThanOrEqual(1 - 1e-9)
        expect(d).toBeLessThanOrEqual(ISLAND_R - 1.2 + 1e-9)
        expect(islandAt(p.x, p.z, 3)).toBe(i)
      }
    }
  })
  it('works with the default random source', () => {
    const p = randomSpot(1)
    expect(islandAt(p.x, p.z, 2)).toBe(1)
  })
})
