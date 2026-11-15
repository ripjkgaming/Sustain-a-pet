import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sparkles, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { canvasTexture, damp, radialTexture, rng, stepSpring } from './shared.js'
import { ISLAND_R, SPACING, clampToWalkable, islandCenter } from './islands.js'
import { AREAS } from '../../game.js'
import River from './River.jsx'
import Footbridge from './Footbridge.jsx'
import RiverProps from './RiverProps.jsx'

export const ISLAND = ISLAND_R // pet wander radius

/* ---------- ground: soft mossy disc fading into the mist ---------- */
function Ground({ onGo, count }) {
  // Invisible input plane only; the visible terrain is the authored Blender habitat. Covers the whole chain.
  const len = (count + 1) * SPACING + 20
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .015, -((count - 1) * SPACING) / 2]}
    onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); onGo(e.point.x, e.point.z) } }}>
    <planeGeometry args={[40, len]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
}

/* ---------- interactive flowers (the garden grows with your ticks) ---------- */
const FLOWER_SPOTS = (() => {
  const r = rng(77)
  return Array.from({ length: 15 }, (_, i) => {
    const a = (i / 15) * Math.PI * 2 + r() * 0.6, d = 1.7 + r() * 2.1
    return { x: Math.cos(a) * d, z: Math.sin(a) * d, color: ['#ff8fb1', '#ffd34e', '#ffffff', '#b99bff', '#ff9f6b'][i % 5], s: 0.8 + r() * 0.5, variant: ['pink', 'gold', 'white', 'violet', 'coral'][i % 5] }
  })
})()

function Flower({ spot, show, onPick, reduced }) {
  const g = useRef(), cur = useRef(0), wob = useRef({ a: 0, v: 0 })
  useFrame((s, dt) => {
    dt = Math.min(dt, 0.05)
    cur.current = reduced ? (show ? 1 : 0) : damp(cur.current, show ? 1 : 0, 4, dt)
    g.current.scale.setScalar(Math.max(0.0001, cur.current) * spot.s)
    g.current.visible = cur.current > 0.01
    const w = wob.current
    if (reduced) { w.a = 0; w.v = 0 }
    else stepSpring(w, 'a', 'v', 60, 4, dt)
    g.current.rotation.z = w.a + (reduced ? 0 : Math.sin(s.clock.elapsedTime * 1.4 + spot.x) * 0.05)
  })
  return (
    <group position={[spot.x, 0, spot.z]}>
      <group ref={g} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); wob.current.v = 7; onPick(spot) } }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <Suspense fallback={null}><AuthoredAsset name={`garden-flower-${spot.variant}`} /></Suspense>
      </group>
    </group>
  )
}

/* ---------- habit mushrooms: each one holds a daily action ---------- */
const SHROOMS = [
  { x: -3.8, z: -2.0, s: 1.05 }, { x: 2.3, z: -3.5, s: 0.9 },
  { x: 4.0, z: 1.5, s: 0.88 }, { x: 1.0, z: 3.4, s: 0.82 },
  { x: -2.6, z: 2.6, s: 0.9 }, { x: -3.4, z: 0.2, s: 0.8 },
  { x: -1.2, z: -1.4, s: 0.95 }, { x: 1.5, z: 0.7, s: 0.78 },
]
function Mushroom({ spot, habit, done, reduced, onPick }) {
  const g = useRef(), sp = useRef({ y: 0, v: 0 })
  const isQuiz = habit.id === 'quiz'
  useFrame((_, dt) => {
    const s = sp.current
    if (reduced) { s.y = 0; s.v = 0 }
    else stepSpring(s, 'y', 'v', 90, 5, dt)
    g.current.scale.set(spot.s * (1 + s.y * 0.7), spot.s * (1 - s.y), spot.s * (1 + s.y * 0.7))
  })
  return (
    <group position={[spot.x, 0, spot.z]}>
      <group ref={g} onClick={(e) => { if (e.delta < 6) { e.stopPropagation(); sp.current.v = -6; onPick(spot) } }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')} onPointerOut={() => (document.body.style.cursor = '')}>
        <Suspense fallback={null}><AuthoredAsset name={`quest-mushroom-${isQuiz ? 'gold' : done ? 'complete' : 'red'}`} /></Suspense>
      </group>
      {isQuiz && <>
        <pointLight position={[0, 0.9, 0]} color="#ffd05a" intensity={1.8} distance={3.4} decay={2} />
        {!reduced && <Sparkles count={9} scale={[1.5, 1.25, 1.5]} position={[0, 0.8, 0]} size={2.4} speed={0.45} color="#ffe49a" />}
      </>}
    </group>
  )
}

/* ---------- atmosphere: hazy trees, bokeh, sun shafts, fireflies ---------- */
function Atmosphere({ reduced, count = 1 }) {
  const blob = useMemo(() => radialTexture([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']], 128), [])
  const ray = useMemo(() => canvasTexture(128, (ctx, n) => {
    const g = ctx.createLinearGradient(0, 0, 0, n)
    g.addColorStop(0, 'rgba(255,248,200,0.9)'); g.addColorStop(1, 'rgba(255,248,200,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n)
    const h = ctx.createLinearGradient(0, 0, n, 0)
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = h; ctx.fillRect(0, 0, n, n)
  }), [])
  const trees = useMemo(() => {
    const r = rng(9)
    return Array.from({ length: 11 }, (_, i) => { const a = (i / 11) * Math.PI * 2 + r() * 0.4, d = 10 + r() * 3; return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 2.5 + r() * 2.5, s: 5 + r() * 4, c: ['#4d7f55', '#5f9460', '#3f6e4b', '#6da568'][i % 4], o: 0.35 + r() * 0.25 } })
  }, [])
  const bokeh = useMemo(() => {
    const r = rng(14)
    return Array.from({ length: 22 }, () => { const a = r() * Math.PI * 2, d = 4.5 + r() * 3.5; return { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.5 + r() * 3.6, s: 0.3 + r() * 0.8, o: 0.18 + r() * 0.3, ph: r() * 6, c: r() > 0.4 ? '#fff3b0' : '#d8ffc2' } })
  }, [])
  const rays = useRef(), bk = useRef([]), { camera } = useThree()
  useFrame((s) => {
    const t = reduced ? 0 : s.clock.elapsedTime
    // keep sun shafts facing the camera around the vertical axis
    rays.current.rotation.y = Math.atan2(camera.position.x, camera.position.z)
    rays.current.children.forEach((m, i) => { m.material.opacity = 0.16 + Math.sin(t * 0.5 + i * 1.7) * 0.06 })
    bk.current.forEach((sp, i) => { if (sp) sp.position.y = bokeh[i].y + Math.sin(t * 0.4 + bokeh[i].ph) * 0.15 })
  })
  return (
    <>
      {trees.map((t, i) => (
        <sprite key={i} position={[t.x, t.y, t.z]} scale={[t.s, t.s * 1.5, 1]}>
          <spriteMaterial map={blob} color={t.c} transparent opacity={t.o} depthWrite={false} />
        </sprite>
      ))}
      <group ref={rays} position={[2.5, 4.2, -2]}>
        {[-1.6, 0, 1.7].map((x, i) => (
          <mesh key={i} position={[x, 0, -i * 0.3]} rotation={[0, 0, 0.5 + i * 0.07]} scale={[1.4 + i * 0.4, 9, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={ray} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        ))}
      </group>
      {bokeh.map((b, i) => (
        <sprite key={i} ref={(el) => (bk.current[i] = el)} position={[b.x, b.y, b.z]} scale={[b.s, b.s, 1]}>
          <spriteMaterial map={blob} color={b.c} transparent opacity={b.o} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
      {!reduced && <Sparkles count={34 + (count - 1) * 20} scale={[9, 2.8, 9 + (count - 1) * SPACING]} position={[0, 1.5, -((count - 1) * SPACING) / 2]} size={4.5} speed={0.3} opacity={0.95} color="#fff7a8" />}
    </>
  )
}

/** The pet's world. Tap the ground to walk; tapping a mushroom walks the pet over, then opens its quest. */
export default function World({ ctl, garden = 3, area = 'meadow', unlocked = ['meadow'], decorations = [], projects = [], reduced, habits = [], done = [], onFlower, onShroom, onOpenQuest }) {
  const questTimer = useRef(0)
  const [initialCount] = useState(unlocked.length)
  useEffect(() => () => clearTimeout(questTimer.current), [])
  const count = Math.max(1, unlocked.length)
  const activeIdx = Math.max(0, unlocked.indexOf(area))
  const ac = islandCenter(activeIdx)
  const go = (x, z) => {
    const p = clampToWalkable(x, z, count)
    ctl.current.goTo?.(p.x, p.z)
  }
  const next = AREAS[unlocked.length]
  return (
    <>
      <Atmosphere reduced={reduced} count={count} />
      <River count={count} reduced={reduced} />
      <RiverProps count={count} hasNext={!!next} />
      <Ground count={count} onGo={(x, z) => { go(x, z) }} />
      {unlocked.map((id, i) => {
        const c = islandCenter(i)
        return <group key={id} position={[c.x, 0, c.z]}><AuthoredHabitat area={id} decorations={decorations} projects={projects} /></group>
      })}
      {unlocked.slice(1).map((id, i) => <Footbridge key={id} index={i} animate={!reduced && i >= initialCount - 1} />)}
      {next && <DistantIsland area={next.id} index={unlocked.length} reduced={reduced} />}
      <group position={[ac.x, 0, ac.z]}>
        {FLOWER_SPOTS.map((f, i) => (
          <Flower key={i} spot={f} show={i < garden} reduced={reduced} onPick={(s) => { go(ac.x + s.x * 0.82, ac.z + s.z * 0.82); onFlower?.(s) }} />
        ))}
        {SHROOMS.map((m, i) => {
          const habit = habits[i]
          if (!habit) return null
          return <Mushroom key={habit.id} spot={m} habit={habit} done={done.includes(habit.id)} reduced={reduced}
            onPick={(s) => { go(ac.x + s.x * 0.8, ac.z + s.z * 0.8); onShroom?.(s); clearTimeout(questTimer.current); questTimer.current = setTimeout(() => onOpenQuest?.(habit.id), 700) }} />
        })}
      </group>
    </>
  )
}

/* ---------- the next locked island: far away, faded into the mist, not interactive ---------- */
const MIST = new THREE.Color('#dfeee8')
function GhostIsland({ name }) {
  const { scene } = useGLTF(`/models/${name}.glb`)
  const copy = useMemo(() => {
    const c = scene.clone(true)
    c.traverse((o) => {
      if (!o.isMesh) return
      o.raycast = () => {}
      const fade = (m) => {
        const n = m.clone()
        n.transparent = true; n.opacity = 0.35; n.depthWrite = false; n.toneMapped = true
        if (n.color) n.color.lerp(MIST, 0.55)
        if (n.emissive) n.emissive.lerp(MIST, 0.4)
        return n
      }
      o.material = Array.isArray(o.material) ? o.material.map(fade) : fade(o.material)
    })
    return c
  }, [scene])
  return <primitive object={copy} />
}
function DistantIsland({ area, index, reduced }) {
  const c = islandCenter(index)
  const blob = useMemo(() => radialTexture([[0, 'rgba(235,248,242,0.9)'], [0.5, 'rgba(235,248,242,0.4)'], [1, 'rgba(235,248,242,0)']], 128), [])
  const mist = useRef([])
  useFrame((s) => {
    const t = reduced ? 0 : s.clock.elapsedTime
    mist.current.forEach((m, i) => { if (m) m.position.x = Math.sin(t * 0.12 + i * 2.1) * 1.4 + (i - 1) * 1.8 })
  })
  return (
    <group position={[c.x, 0, c.z]}>
      <Suspense fallback={null}><GhostIsland name={`habitat-${area}`} /></Suspense>
      {[0, 1, 2].map((i) => (
        <sprite key={i} ref={(el) => (mist.current[i] = el)} position={[(i - 1) * 1.8, 0.7 + i * 0.25, 0.8 - i * 0.6]} scale={[5.5, 2.4, 1]}>
          <spriteMaterial map={blob} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  )
}

const PROP_ALIASES = { flowers: 'wildflowers', 'meadow-bed': 'wildflowers', 'meadow-fountain': 'birdbath', 'pond-bridge': 'bridge', 'pond-lilies': 'lilies', 'grove-tree': 'wishing-tree', 'grove-picnic': 'picnic' }
const PROJECT_AREA = { 'meadow-bed': 'meadow', 'meadow-fountain': 'meadow', 'pond-bridge': 'pond', 'pond-lilies': 'pond', 'grove-tree': 'grove', 'grove-picnic': 'grove' }
// Keep purchased/restored landmarks within the default camera's open garden, above the dock.
const PROJECT_POSITION = { 'meadow-bed': [-2.2, 0, -3], 'meadow-fountain': [3, 0, -.4], 'pond-bridge': [0, 0, -4.3], 'pond-lilies': [1, 0, -4.3], 'grove-tree': [-2.8, 0, -2.9], 'grove-picnic': [2.8, 0, -2.3] }
const DECORATION_POSITION = { lantern: [2.9, 0, 0], flowers: [-2.6, 0, -.3], bench: [.2, 0, -2.8] }
const PROPS = new Set(['wildflowers', 'birdbath', 'lantern', 'compost', 'pond-cleanup', 'tree-nursery', 'pollinator-garden', 'bench', 'bridge', 'lilies', 'wishing-tree', 'picnic'])
function AuthoredAsset({ name, position = [0, 0, 0] }) {
  const { scene } = useGLTF(`/models/${name}.glb`)
  const copy = useMemo(() => scene.clone(true), [scene])
  return <primitive object={copy} position={position} />
}
function AuthoredHabitat({ area, decorations, projects }) {
  const key = ['meadow', 'pond', 'grove'].includes(area) ? area : 'meadow'
  const ids = [...decorations, ...projects].map((item) => typeof item === 'string' ? item : item.id).filter((id) => !PROJECT_AREA[id] || PROJECT_AREA[id] === key)
  return <group>
    <Suspense fallback={null}><AuthoredAsset name={`habitat-${key}`} /></Suspense>
    {ids.map((id, i) => { const asset = PROP_ALIASES[id] || id; return PROPS.has(asset) ? <Suspense key={`${id}-${i}`} fallback={null}><AuthoredAsset name={`prop-${asset}`} position={PROJECT_POSITION[id] || DECORATION_POSITION[id] || [0, 0, -2.8]} /></Suspense> : null })}
  </group>
}
