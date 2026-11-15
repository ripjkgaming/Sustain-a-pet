import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import Face from './Face.jsx'
import { createBotanicalInstance, updateBotanicalInstance } from './botanical.js'

const FACES = {
  leafling: { y: 0.96, z: 0.72, size: 1.05, spread: 0.34 },
  mossy: { y: 0.81, z: 0.80, size: 1.05, spread: 0.34 },
  sunbud: { y: 1.32, z: 0.56, size: 1, spread: 0.31 },
}
const PATHS = ['leafling', 'mossy', 'sunbud'].map((name) => `${import.meta.env.BASE_URL}models/${name}.glb`)

/** Blender-authored geometry and embedded PBR textures, with independent live state per pet. */
export default function BotanicalModel({ sprite, stage, mood, ctl, reduced }) {
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/${sprite}.glb`)
  const model = useMemo(() => {
    return createBotanicalInstance(scene, stage)
    // Initial growth is set here; subsequent stage changes ease in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  useEffect(() => () => model.materials.forEach(({ mat }) => mat.dispose()), [model])

  useFrame(({ clock }, dt) => {
    updateBotanicalInstance(model, { stage, state: ctl.current, reduced, time: clock.elapsedTime, dt })
  })

  return (
    <group>
      <primitive object={model.root} dispose={null} />
      <Face {...FACES[sprite]} mood={mood} reduced={reduced} />
    </group>
  )
}

PATHS.forEach((path) => useGLTF.preload(path))
