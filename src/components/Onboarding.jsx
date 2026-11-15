import { lazy, Suspense, useEffect, useState } from 'react'
import SceneBoundary from './SceneBoundary.jsx'
import { SPRITES } from './pet3d/shared.js'
import { FlowBar, Mascot, Say, SpriteProvider } from './Duo.jsx'
import Icon from './Icons.jsx'
import { sfx } from '../sfx.js'

const PetCanvas = lazy(() => import('./pet3d/PetCanvas.jsx'))
const PetModel = lazy(() => import('./pet3d/PetModel.jsx'))
const KEYS = Object.keys(SPRITES)
const PROGRESS = [0.22, 0.58, 0.9]
const BENEFITS = [
  ['heart', 'Build kinder habits', 'One small action a day'],
  ['sprout', 'Watch a friend grow', 'From seed to guardian'],
  ['leaf', 'Restore the garden', 'Bring the meadow back'],
  ['lens', 'Snap with GreenLens', 'Turn what you see into a tiny real quest'],
]

export default function Onboarding({ reduced, onHatch }) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [sprite, setSprite] = useState('leafling')
  const [bounce, setBounce] = useState(0)
  const [touched, setTouched] = useState(false)
  const [hatching, setHatching] = useState(false)
  useEffect(() => {
    if (!hatching) return
    const timer = setTimeout(() => onHatch(name, sprite), 240)
    return () => clearTimeout(timer)
  }, [hatching, name, sprite, onHatch])
  const empty = name.trim().length === 0
  const pick = (k) => { sfx.select(); setSprite(k); setBounce((b) => b + 1) }
  useEffect(() => {
    if (step !== 0) return
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = KEYS[Number(e.key) - 1]
      if (k) pick(k)
      if (e.key === 'Enter') setStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const next = () => {
    sfx.tap()
    if (step === 1) { setTouched(true); if (empty) return }
    if (step === 2) { if (!hatching) setHatching(true); return }
    setStep(step + 1)
  }

  return (
    <SpriteProvider value={sprite}>
    <main className={`onboard duo-screen ${hatching ? 'is-hatching' : ''}`}>
      <FlowBar value={PROGRESS[step]} onBack={step > 0 ? () => setStep(step - 1) : undefined} />
      <div className="duo-body" key={step}>
        {step === 0 && <>
          <Say>Who will you grow with?</Say>
          <div className="stage-pick" aria-label="Preview your three companions">
            <SceneBoundary><Suspense fallback={<div className="loading">Loading…</div>}>
              <PetCanvas camera={{ position: [0, 1.6, 9.4], fov: 34 }} target={[0, 1.1, 0]}>
                {KEYS.map((k, i) => (
                  <group key={k} onClick={() => pick(k)}>
                    <PetModel sprite={k} stage={1} mood="Thriving" reduced={reduced} position={[(i - 1) * 2.35, 0, 0]} scale={k === sprite ? 1.05 : 0.82}
                      fx={{ bounce: k === sprite ? bounce : 0 }} />
                  </group>
                ))}
              </PetCanvas>
            </Suspense></SceneBoundary>
          </div>
          <div className="duo-options" role="radiogroup" aria-label="Choose your pet">
            {KEYS.map((k, i) => (
              <label key={k} className={`duo-option ${sprite === k ? 'on' : ''}`}>
                <input type="radio" name="sprite" value={k} checked={sprite === k} onChange={() => pick(k)} />
                <span className="opt-emoji" aria-hidden="true"><Mascot size={44} sprite={k} /></span>
                <span className="opt-copy"><strong>{SPRITES[k].label}</strong></span>
                <span className="opt-box" aria-hidden="true">{sprite === k && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                <kbd className="key" aria-hidden="true">{i + 1}</kbd>
              </label>
            ))}
          </div>
        </>}
        {step === 1 && <>
          <Say>What will you call {SPRITES[sprite].label}?</Say>
          <form id="name-form" className="duo-name" onSubmit={(e) => { e.preventDefault(); next() }}>
            <label htmlFor="pet-name" className="sr-only">Name your pet</label>
            <input id="pet-name" value={name} maxLength={20} autoComplete="off" autoFocus placeholder="Pip" aria-invalid={touched && empty}
              aria-describedby="name-help" onChange={(e) => setName(e.target.value)} />
            <p id="name-help" className={touched && empty ? 'err' : 'muted'}>{touched && empty ? 'Give your pet a name first.' : `${name.length} / 20`}</p>
          </form>
        </>}
        {step === 2 && <>
          <Say>{name.trim() || 'Your friend'} can help you grow!</Say>
          <ul className="benefits">
            {BENEFITS.map(([e, t, d]) => <li key={t}><span aria-hidden="true"><Icon name={e} size={28} /></span><div><strong>{t}</strong><small>{d}</small></div></li>)}
          </ul>
        </>}
      </div>
      <footer className="duo-foot">
        <button type="button" className="duo-btn green" disabled={hatching || (step === 1 && empty)} onClick={next}>{step === 2 ? `Hatch ${SPRITES[sprite].label}` : 'Continue'}</button>
      </footer>
    </main>
    </SpriteProvider>
  )
}
