// Standalone asset review: model-preview.html. Does not read or write game saves.
import { Suspense, useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import PetCanvas from './PetCanvas.jsx'
import PetModel from './PetModel.jsx'
import { MOODS, SPRITES } from './shared.js'

function ReviewCamera({ count }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const distance = Math.max(4.8, (count === 1 ? 3.8 : 8.5) / (size.width / size.height)) / (2 * Math.tan(17 * Math.PI / 180))
    camera.position.set(0, 2.1, distance)
    camera.lookAt(0, 1.7, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.width, size.height, count])
  return null
}

export default function ModelReview() {
  const initial = new URLSearchParams(location.search)
  const [stage, setStage] = useState(Number(initial.get('stage') ?? 1))
  const [mood, setMood] = useState(initial.get('mood') ?? 'Thriving')
  const [power, setPower] = useState(0)
  const [reduced, setReduced] = useState(false)
  const [sprite, setSprite] = useState(initial.get('sprite') ?? 'all')
  const api = useRef({})
  const keys = sprite === 'all' ? Object.keys(SPRITES) : [sprite]
  return (
    <main style={{ background: '#d6dfcc', color: '#183b26', fontFamily: 'system-ui', minHeight: '100vh' }}>
      <div style={{ padding: '20px 28px', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
        <strong>Botanical pet review</strong>
        <label>Character <select aria-label="Character" value={sprite} onChange={(e) => setSprite(e.target.value)}><option value="all">All three</option>{Object.keys(SPRITES).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Growth <select aria-label="Growth" value={stage} onChange={(e) => setStage(Number(e.target.value))}>{['Seed', 'Sprout', 'Sapling', 'Guardian'].map((s, i) => <option value={i} key={s}>{s}</option>)}</select></label>
        <label>Health <select aria-label="Health" value={mood} onChange={(e) => setMood(e.target.value)}>{Object.keys(MOODS).map((s) => <option key={s}>{s}</option>)}</select></label>
        <button onClick={() => setPower((p) => p + 1)}>Float for 12 seconds</button>
        <label><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} />Reduced motion</label>
      </div>
      <div style={{ height: 'calc(100vh - 110px)', minHeight: 420 }}>
        <Suspense fallback={<p>Loading botanical textures…</p>}>
          <PetCanvas camera={{ position: [0, 1.9, keys.length === 1 ? 7.5 : 15], fov: 34 }} target={[0, 1.3, 0]} api={api}>
            <ReviewCamera count={keys.length} />
            {keys.map((key, i) => <PetModel key={key} sprite={key} position={[(i - (keys.length - 1) / 2) * 2.9, 0, 0]} stage={stage} mood={mood} reduced={reduced} fx={{ power, powerSecs: 12 }} />)}
          </PetCanvas>
        </Suspense>
      </div>
      <p style={{ margin: 0, padding: '0 28px 15px' }}>Embedded albedo and normal maps · Four growth stages · Four health moods · No game saves changed</p>
    </main>
  )
}
