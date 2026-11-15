import { Suspense, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { rng } from './shared.js'
import { ISLAND_R, islandCenter } from './islands.js'

const R = ISLAND_R + 0.1 // bank radius
const WATER_Y = -0.1
const FLANK = 0.68 // radians either side of the bridge axis (leaves the 1.2 wide bridge end clear)
const CLEAR = 0.9 // no props where |x| < CLEAR

function Asset({ name, position, rotationY = 0, scale = 1 }) {
  const { scene } = useGLTF(`/models/${name}.glb`)
  const copy = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => { if (o.isMesh) o.raycast = () => {} })
    return c
  }, [scene])
  return <primitive object={copy} position={position} rotation={[0, rotationY, 0]} scale={scale} />
}

/** One shore of island i. dir = -1 north (toward -z), +1 south. bridge: a footbridge meets this shore. */
function Shore({ i, dir, bridge }) {
  const c = islandCenter(i)
  const items = useMemo(() => {
    const base = dir < 0 ? Math.PI : 0 // outward angle: (sin t, cos t)
    const r = rng(31 + i * 7 + (dir < 0 ? 1 : 2))
    const banks = (bridge ? [-FLANK, FLANK] : [0]).map((d) => ({ t: base + d }))
    const place = (t, rad) => ({ x: c.x + Math.sin(t) * rad, z: c.z + Math.cos(t) * rad })
    const spots = (n, minD, maxD, rad0, rad1) => {
      const out = []
      for (let k = 0; k < n * 6 && out.length < n; k++) {
        const t = base + (r() * 2 - 1) * maxD
        const rad = rad0 + r() * (rad1 - rad0)
        const p = place(t, rad)
        if (Math.abs(p.x - c.x) < CLEAR || Math.abs(t - base) < minD) continue
        out.push({ ...p, rot: r() * Math.PI * 2, s: 0.8 + r() * 0.4 })
      }
      return out
    }
    return {
      banks: banks.map((b) => ({ ...place(b.t, R), rot: b.t })),
      reeds: spots(4 + Math.floor(r() * 3), 0.2, 1.3, R + 0.15, R + 0.45),
      stones: spots(2 + Math.floor(r() * 2), 0.3, 1.2, R + 0.5, R + 0.9),
    }
  }, [c.x, c.z, i, dir, bridge])
  return (
    <>
      {items.reeds.map((p, k) => <Asset key={`r${k}`} name="prop-reeds" position={[p.x, WATER_Y, p.z]} rotationY={p.rot} scale={p.s} />)}
      {items.stones.map((p, k) => <Asset key={`s${k}`} name="prop-river-stones" position={[p.x, WATER_Y, p.z]} rotationY={p.rot} scale={0.7 * p.s} />)}
    </>
  )
}

/** Authored riverbanks, reeds and stones along the shores of unlocked islands. Never on the ghost island; not interactive. */
export default function RiverProps({ count, hasNext }) {
  return (
    <Suspense fallback={null}>
      {Array.from({ length: count }, (_, i) => {
        const north = i + 1 < count || hasNext
        return (
          <group key={i}>
            {north && <Shore i={i} dir={-1} bridge={i + 1 < count} />}
            {i > 0 && <Shore i={i} dir={1} bridge />}
          </group>
        )
      })}
    </Suspense>
  )
}
