import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import PetRig from './PetRig.jsx'
import Burst from './Burst.jsx'
import BotanicalModel from './BotanicalModel.jsx'
import { islandAt, isWalkable, islandCenter, clampToWalkable, routeTo, randomSpot } from './islands.js'

const SPEED = { Thriving: 1.1, Okay: 0.8, Wilting: 0.45, Sick: 0 }

/**
 * Moves the pet around its world. It wanders to random spots, walks where you tap, and turns to
 * face the camera when idle. Position is shared through `ctl.current.pos` so the camera can follow.
 */
function Wanderer({ ctl, mood, reduced, motion, children }) {
  const g = useRef()
  const st = useRef({ x: 0, z: 0.4, heading: 0, goal: null, queue: [], idle: 2.5, speed: 0, hold: 0, parked: false, held: false, manual: false, count: null, away: 0, arrive: 0 })
  const { camera } = useThree()

  useEffect(() => {
    const c = ctl.current
    const layoutNow = () => c.layout ?? { count: 1, home: 0 }
    const follow = (path, manual) => { const s = st.current; s.goal = path[0] ?? null; s.queue = path.slice(1); s.manual = manual }
    c.goTo = (x, z) => {
      const s = st.current, { count } = layoutNow()
      const t = clampToWalkable(x, z, count)
      follow(routeTo(s, t, count), true)
      s.hold = 0; s.parked = false; s.held = false
    }
    c.hold = (sec) => { const s = st.current; s.goal = null; s.queue = []; s.hold = sec; s.parked = true; s.held = true; s.manual = false }
  }, [ctl, mood])

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    const s = st.current, max = SPEED[mood]
    const { count = 1, home = 0 } = ctl.current.layout ?? {}
    const goHome = () => {
      const t = randomSpot(home)
      const path = routeTo(s, t, count)
      s.goal = path[0]; s.queue = path.slice(1); s.manual = false
    }
    if (s.count === null) { // first frame: start on the home island
      const c = islandCenter(home)
      s.x = c.x; s.z = c.z + 0.4; s.count = count
    }
    if (count > s.count) s.arrive = 1.5 // new island unlocked: cross the new bridge shortly
    if (count !== s.count) s.count = count
    if (!reduced && s.arrive > 0) { s.arrive -= dt; if (s.arrive <= 0 && max > 0) { s.parked = false; s.held = false; goHome() } }
    if (reduced && s.arrive > 0) { s.arrive = 0; const t = randomSpot(home); s.x = t.x; s.z = t.z; s.goal = null; s.queue = [] }
    if (!isWalkable(s.x, s.z, count)) { // layout shrank: never stand in water
      const c = clampToWalkable(s.x, s.z, count)
      s.x = c.x; s.z = c.z; s.goal = null; s.queue = []
    }
    if (reduced && !s.manual) { s.goal = null; s.queue = [] }
    if (s.hold > 0) s.hold -= dt
    const here = islandAt(s.x, s.z, count)
    if (here >= 0 && here !== home) s.away += dt
    else if (here === home) s.away = 0
    if (!s.goal && s.hold <= 0 && !reduced && max > 0 && s.away > 10 && !s.held) { s.away = 0; s.parked = false; goHome() }
    if (!s.goal && s.hold <= 0 && !s.parked && max > 0 && !reduced) {
      s.idle -= dt
      if (s.idle <= 0) {
        const spot = randomSpot(here >= 0 ? here : home)
        s.goal = spot; s.queue = []; s.manual = false
      }
    }
    let target = s.heading
    if (s.goal) {
      const dx = s.goal.x - s.x, dz = s.goal.z - s.z, dist = Math.hypot(dx, dz)
      if (dist < 0.1) {
        if (s.queue.length) s.goal = s.queue.shift()
        else { const wasManual = s.manual; s.goal = null; s.idle = 2 + Math.random() * 4; s.speed = 0; s.parked = wasManual; s.manual = false }
      } else {
        target = Math.atan2(dx, dz)
        const last = !s.queue.length
        const want = Math.max(max, s.manual ? 0.5 : 0) * (last ? Math.min(1, dist / 0.6 + 0.35) : 1)
        s.speed = damp(s.speed, want, 6, dt)
        s.x += (dx / dist) * s.speed * dt
        s.z += (dz / dist) * s.speed * dt
      }
    } else {
      s.speed = damp(s.speed, 0, 8, dt)
      target = Math.atan2(camera.position.x - s.x, camera.position.z - s.z) // face the viewer when idle
    }
    const diff = ((target - s.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
    s.heading += diff * Math.min(1, dt * 6)
    g.current.position.set(s.x, 0, s.z)
    g.current.rotation.y = s.heading
    const previousPhase = motion.current.phase
    if (s.speed > 0.035) motion.current.phase += s.speed * dt * 10
    const steps = Math.floor(motion.current.phase / Math.PI) - Math.floor(previousPhase / Math.PI)
    if (steps > 0) ctl.current.stepCount = (ctl.current.stepCount ?? 0) + steps
    motion.current.speed = s.speed
    ctl.current.speed = s.speed
    ctl.current.pos.set(s.x, 0, s.z)
  })
  return <group ref={g}>{children}</group>
}
const damp = THREE.MathUtils.damp

/** One pet (no canvas): sprite model, shared motion rig and reward bursts. With `ctl` it roams the world. */
export default function PetModel({ sprite = 'leafling', stage = 0, mood = 'Thriving', fx = {}, reduced = false, position, scale, ctl, onPat }) {
  const character = ['leafling', 'mossy', 'sunbud'].includes(sprite) ? sprite : 'leafling'
  const motion = useRef({ speed: 0, phase: 0 })
  const inner = (
    <>
      <group
        onClick={onPat ? (e) => { if (e.delta < 6) { e.stopPropagation(); onPat() } } : undefined}
        onPointerOver={onPat ? () => (document.body.style.cursor = 'pointer') : undefined}
        onPointerOut={onPat ? () => (document.body.style.cursor = '') : undefined}
      >
        <PetRig stage={stage} mood={mood} fx={fx} reduced={reduced} scale={scale} motion={motion}>
          {(c) => <BotanicalModel sprite={character} ctl={c} stage={stage} mood={mood} reduced={reduced} />}
        </PetRig>
      </group>
      <Burst kind="leaves" burstKey={fx.leaves} reduced={reduced} origin={[0, 1.4, 0.4]} />
      <Burst kind="confetti" burstKey={fx.confetti} reduced={reduced} origin={[0, 1.2, 0.5]} />
      <Burst kind="sparkle" burstKey={fx.sparkle} reduced={reduced} origin={[0, 1.4, 0.4]} />
    </>
  )
  return (
    <group position={position}>
      {ctl ? <Wanderer ctl={ctl} mood={mood} reduced={reduced} motion={motion}>{inner}</Wanderer> : inner}
    </group>
  )
}
