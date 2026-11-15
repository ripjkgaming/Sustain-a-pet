import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { canvasTexture, radialTexture, rng } from './shared.js'
import { ISLAND_R, SPACING, islandCenter } from './islands.js'

const Y = -0.12
const FOAM_R = ISLAND_R + 1.0

/** Stylised river: one big water plane (ripples scroll, edges fade to mist) plus a foam ring round each island. */
export default function River({ count, reduced }) {
  // water covers the unlocked chain plus the distant locked island
  const len = (count + 1) * SPACING + 26, cz = -(count * SPACING) / 2
  const ripple = useMemo(() => {
    const t = canvasTexture(256, (ctx, n) => {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, n, n)
      const r = rng(5)
      ctx.strokeStyle = 'rgba(120,190,200,0.55)'; ctx.lineWidth = 3
      for (let i = 0; i < 26; i++) {
        const x = r() * n, y = r() * n, w = 14 + r() * 26
        for (const ox of [-n, 0, n]) { ctx.beginPath(); ctx.ellipse(x + ox, y, w, w * 0.22, 0, 0, Math.PI * 2); ctx.stroke() }
      }
    })
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, len / 6)
    return t
  }, [len])
  const fade = useMemo(() => canvasTexture(128, (ctx, n) => {
    const g = ctx.createRadialGradient(n / 2, n / 2, n * 0.18, n / 2, n / 2, n / 2)
    g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#fff'); g.addColorStop(1, '#000')
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n)
  }), [])
  const foam = useMemo(() => {
    const a = (ISLAND_R - 0.3) / FOAM_R, b = (ISLAND_R + 0.1) / FOAM_R
    return radialTexture([[0, 'rgba(255,255,255,0)'], [a, 'rgba(255,255,255,0)'], [b, 'rgba(235,255,250,0.85)'], [b + 0.08, 'rgba(190,240,235,0.5)'], [1, 'rgba(190,240,235,0)']], 256)
  }, [])
  const rings = useRef()
  useFrame((s) => {
    if (reduced) return
    const t = s.clock.elapsedTime
    ripple.offset.set(t * 0.01, -t * 0.02)
    if (rings.current) rings.current.children.forEach((m, i) => m.scale.setScalar(1 + Math.sin(t * 0.9 + i) * 0.015))
  })
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Y, cz]} renderOrder={-2}>
        <planeGeometry args={[46, len]} />
        <meshStandardMaterial color="#4fb6b8" emissive="#1f7f8a" emissiveIntensity={0.4} map={ripple} alphaMap={fade} transparent opacity={0.92} roughness={0.35} depthWrite={false} />
      </mesh>
      <group ref={rings}>
        {Array.from({ length: count }, (_, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[islandCenter(i).x, Y + 0.02, islandCenter(i).z]} renderOrder={-1}>
            <circleGeometry args={[FOAM_R, 48]} />
            <meshBasicMaterial map={foam} transparent depthWrite={false} />
          </mesh>
        ))}
      </group>
    </>
  )
}
