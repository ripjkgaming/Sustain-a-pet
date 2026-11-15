import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { bridgeSpan, BRIDGE_W } from './islands.js'

const PLANKS = 9
const STEP = 0.1 // seconds between planks
const GROW = 0.3 // seconds per plank
const WOOD = ['#9a6a3c', '#8a5c32', '#a87846']

/** Wooden footbridge between island `index` and `index + 1`. With `animate`, planks pop in one by one (~1.2s). */
export default function Footbridge({ index, animate = false }) {
  const { z0, z1 } = bridgeSpan(index)
  const len = z0 - z1, pitch = len / PLANKS
  const planks = useRef([]), rails = useRef(), t = useRef(animate ? 0 : 99)
  const posts = useMemo(() => Array.from({ length: 4 }, (_, i) => -len / 2 + 0.15 + (i / 3) * (len - 0.3)), [len])
  useFrame((_, dt) => {
    if (t.current > PLANKS * STEP + GROW + 0.4) return
    t.current += Math.min(dt, 0.05)
    planks.current.forEach((m, i) => {
      if (!m) return
      const k = Math.min(1, Math.max(0, (t.current - i * STEP) / GROW))
      const e = 1 - Math.pow(1 - k, 3)
      m.scale.setScalar(Math.max(0.0001, e)); m.position.y = 0.14 + (1 - e) * 0.5
    })
    if (rails.current) rails.current.scale.set(1, 1, Math.max(0.0001, Math.min(1, (t.current - 0.3) / (PLANKS * STEP))))
  })
  return (
    <group position={[0, 0, (z0 + z1) / 2]}>
      {Array.from({ length: PLANKS }, (_, i) => (
        <mesh key={i} ref={(el) => (planks.current[i] = el)} position={[0, 0.14, len / 2 - pitch * (i + 0.5)]}>
          <boxGeometry args={[BRIDGE_W - 0.1, 0.08, pitch * 0.82]} />
          <meshStandardMaterial color={WOOD[i % 3]} roughness={0.9} />
        </mesh>
      ))}
      <group ref={rails}>
        {[-1, 1].map((sd) => (
          <group key={sd} position={[sd * (BRIDGE_W / 2 - 0.04), 0, 0]}>
            <mesh position={[0, 0.5, 0]}><boxGeometry args={[0.07, 0.07, len]} /><meshStandardMaterial color="#7a4e28" roughness={0.9} /></mesh>
            {posts.map((pz, i) => <mesh key={i} position={[0, 0.32, pz]}><boxGeometry args={[0.09, 0.42, 0.09]} /><meshStandardMaterial color="#6b4423" roughness={0.9} /></mesh>)}
          </group>
        ))}
      </group>
    </group>
  )
}
