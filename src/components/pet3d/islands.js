// Island chain geometry (pure, no three/react). Islands sit along -z, separated by rivers.
// The pet may only stand on island discs and on footbridges between consecutive unlocked islands.

export const ISLAND_R = 3.4
export const RIVER = 3.4
export const SPACING = 2 * ISLAND_R + RIVER
export const BRIDGE_W = 1.2

const EPS = 1e-6

export const islandCenter = (i) => ({ x: 0, z: -i * SPACING })

/** Bridge from the edge of island i to the near edge of island i+1. */
export const bridgeSpan = (i) => ({ x: 0, z0: -i * SPACING - ISLAND_R, z1: -(i + 1) * SPACING + ISLAND_R })

/** Index (< count) of the island disc the point stands on, else -1. */
export function islandAt(x, z, count) {
  for (let i = 0; i < count; i++) {
    if (Math.hypot(x, z + i * SPACING) <= ISLAND_R + EPS) return i
  }
  return -1
}

/** Index of the bridge (between unlocked islands) the point stands on, else -1. */
function bridgeAt(x, z, count) {
  for (let i = 0; i < count - 1; i++) {
    const b = bridgeSpan(i)
    if (Math.abs(x) <= BRIDGE_W / 2 + EPS && z <= b.z0 + EPS && z >= b.z1 - EPS) return i
  }
  return -1
}

export const isWalkable = (x, z, count) => islandAt(x, z, count) >= 0 || bridgeAt(x, z, count) >= 0

/** Nearest walkable point to (x,z). With no islands (count < 1) island 0 is used. */
export function clampToWalkable(x, z, count) {
  const n = Math.max(1, count)
  if (isWalkable(x, z, n)) return { x, z }
  let best = null, bestD = Infinity
  const consider = (px, pz) => {
    const d = Math.hypot(px - x, pz - z)
    if (d < bestD) { bestD = d; best = { x: px, z: pz } }
  }
  for (let i = 0; i < n; i++) {
    const c = islandCenter(i)
    const dx = x - c.x, dz = z - c.z, r = Math.hypot(dx, dz) || 1
    const k = Math.min(1, ISLAND_R / r)
    consider(c.x + dx * k, c.z + dz * k)
  }
  for (let i = 0; i < n - 1; i++) {
    const b = bridgeSpan(i)
    consider(Math.max(-BRIDGE_W / 2, Math.min(BRIDGE_W / 2, x)), Math.max(b.z1, Math.min(b.z0, z)))
  }
  return best
}

/** Where a point lives: island index, or a bridge index. */
function locate(p, count) {
  const island = islandAt(p.x, p.z, count)
  return { island, bridge: island >= 0 ? -1 : bridgeAt(p.x, p.z, count) }
}

/** Waypoints (excluding `from`, including `to`) that stay on walkable ground. */
export function routeTo(from, to, count) {
  const n = Math.max(1, count)
  const dest = clampToWalkable(to.x, to.z, n)
  const start = clampToWalkable(from.x, from.z, n)
  const f = locate(start, n), t = locate(dest, n)

  // Same island or same bridge: a straight line stays on convex ground.
  if (f.bridge >= 0 && f.bridge === t.bridge) return [dest]
  if (f.island >= 0 && f.island === t.island) return [dest]

  // Island to walk to first: the target island, or the end of the target bridge on the near side.
  let target = t.island
  if (target < 0) {
    const fromIdx = f.island >= 0 ? f.island : f.bridge
    target = fromIdx <= t.bridge ? t.bridge : t.bridge + 1
  }

  const path = []
  let cur
  if (f.island >= 0) cur = f.island
  else {
    // On a bridge: walk to its end that faces the target, then go island by island.
    const b = bridgeSpan(f.bridge)
    const higher = target > f.bridge
    path.push({ x: 0, z: higher ? b.z1 : b.z0 })
    cur = higher ? f.bridge + 1 : f.bridge
  }
  const dir = target >= cur ? 1 : -1
  while (cur !== target) {
    path.push({ x: 0, z: -cur * SPACING - dir * ISLAND_R }, { x: 0, z: -(cur + dir) * SPACING + dir * ISLAND_R })
    cur += dir
  }
  if (t.bridge >= 0) {
    // Target on a bridge: step onto it from the end of island `cur`.
    const b = bridgeSpan(t.bridge)
    path.push({ x: 0, z: cur === t.bridge ? b.z0 : b.z1 })
  }
  path.push(dest)
  return path
}

/** Random spot on island i, between 1 and ISLAND_R - 1.2 from its centre. */
export function randomSpot(i, rand = Math.random) {
  const c = islandCenter(i)
  const a = rand() * Math.PI * 2, d = 1 + rand() * (ISLAND_R - 2.2)
  return { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d }
}
