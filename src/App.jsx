import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { activeOf, todayOf, useApp } from './store.js'
import { habitsDone, moodFor, stageIndex } from './engine.js'
import habitList from './data/habits.json'
import { questionFor } from './components/QuizCard.jsx'
import Vitals from './components/Vitals.jsx'
import Icon from './components/Icons.jsx'
import DemoDrawer from './components/DemoDrawer.jsx'
import { Splash, SpriteProvider } from './components/Duo.jsx'
import Onboarding from './components/Onboarding.jsx'
import Rewards, { unlockText } from './components/Rewards.jsx'
import { usePrefersReducedMotion } from './components/pet3d/shared.js'
import LeafFootsteps from './components/LeafFootsteps.jsx'
import GardenJournal from './components/GardenJournal.jsx'
import SceneBoundary from './components/SceneBoundary.jsx'
import { AREAS } from './game.js'

const PetCanvas = lazy(() => import('./components/pet3d/PetCanvas.jsx'))
const PetModel = lazy(() => import('./components/pet3d/PetModel.jsx'))
const World = lazy(() => import('./components/pet3d/World.jsx'))

let uid = 0
const TUTORIAL_KEY = 'sustain-pet-tutorial-v1'
const tutorialStorage = {
  get() { try { return localStorage.getItem(TUTORIAL_KEY) } catch { return null } },
  set(value) { try { localStorage.setItem(TUTORIAL_KEY, value) } catch { /* guide remains usable without storage */ } },
}
const tutorialSteps = [
  ['Choose a mushroom', 'Tap any mushroom. Your pet will wander over, then its daily quest appears.'],
  ['Complete a real habit', 'Tick the quest to earn XP. Your pet stays by that mushroom while you play.'],
  ['Find the golden quest', 'The glowing gold mushroom holds the daily quiz. You will hear a soft leaf rustle as your pet walks.'],
]

function QuickGuide({ onFinish }) {
  const [step, setStep] = useState(0)
  return <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
    <section className="tutorial-card">
      <span className="tutorial-kicker">A QUICK GARDEN GUIDE · {step + 1} OF {tutorialSteps.length}</span>
      <h2 id="tutorial-title">{tutorialSteps[step][0]}</h2>
      <p>{tutorialSteps[step][1]}</p>
      <div className="tutorial-actions">
        <button className="tutorial-skip" onClick={onFinish}>Skip guide</button>
        <button className="primary" onClick={() => step === tutorialSteps.length - 1 ? onFinish() : setStep(step + 1)}>{step === tutorialSteps.length - 1 ? 'Start exploring' : 'Next'}</button>
      </div>
    </section>
  </div>
}

export default function App() {
  const [app, dispatch] = useApp()
  const reduced = usePrefersReducedMotion()
  const pet = activeOf(app)
  const today = todayOf(app)

  const [fx, setFx] = useState({ bounce: 0, evolve: 0, dance: 0, leaves: 0, confetti: 0, sparkle: 0, power: 0, powerSecs: 5 })
  const [floats, setFloats] = useState([])
  const [toasts, setToasts] = useState([])
  const [evolve, setEvolve] = useState(null)
  const [live, setLive] = useState('')
  const [tutorial, setTutorial] = useState(() => tutorialStorage.get() === 'in-progress' ? 'in-progress' : null)
  const [splash, setSplash] = useState(true)
  const endSplash = useCallback(() => setSplash(false), [])
  const taps = useRef([])
  const camApi = useRef({})
  const petCtl = useRef({ pos: new THREE.Vector3(0, 0, 0.4) })

  useEffect(() => {
    if (tutorial) tutorialStorage.set(tutorial)
  }, [tutorial])
  const finishTutorial = () => { tutorialStorage.set('done'); setTutorial(null) }

  const bump = useCallback((...keys) => setFx((f) => { const n = { ...f }; keys.forEach((k) => (n[k] += 1)); return n }), [])
  // Power-up: green glow, floating, orbiting motes. Longer for bigger rewards; never shorter than what is left.
  const powerUp = useCallback((secs) => setFx((f) => ({ ...f, power: f.power + 1, powerSecs: secs, sparkle: f.sparkle + 1 })), [])
  const pushToast = useCallback((text) => {
    const id = ++uid
    setToasts((t) => [...t, { id, text }].slice(-3))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  // Play reward events each time the app state produces new ones.
  useEffect(() => {
    if (!app.events.length) return
    const name = pet?.pet.name
    for (const e of app.events) {
      if (e.type === 'game') { pushToast(e.text); setLive(e.text) }
      if (e.type === 'tick') {
        bump('bounce', 'leaves')
        powerUp(e.xp >= 15 ? 7 : 5)
        const id = ++uid
        setFloats((f) => [...f, { id, xp: e.xp, x: 40 + Math.random() * 20 }])
        setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1400)
      }
      if (e.type === 'quizCorrect') { bump('bounce', 'confetti'); powerUp(8) }
      if (e.type === 'stageUp') { bump('evolve'); powerUp(12); setTimeout(() => setEvolve({ stage: e.stage }), 900) }
      if (e.type === 'unlock') { bump('confetti'); powerUp(10); pushToast(unlockText(e.id)) }
      if (e.type === 'allDone') { bump('dance', 'confetti'); powerUp(14); pushToast('All habits done today! 🌍') }
      if (e.type === 'mood') setLive(`${name} feels ${e.mood.toLowerCase()}`)
    }
  }, [app.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  const petTapRef = useRef(() => {})
  // Keyboard: 1-7 tick habits, A/B/C answer the quiz, P pats the pet, Shift+D toggles demo, Esc closes the cutscene.
  const kb = useRef()
  kb.current = { pet, today, app, tutorial, evolve }
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('.garden-journal, .garden-dock, input:not([type=checkbox]), textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      const { pet: p, today: t, app: a, tutorial: guide, evolve: cutscene } = kb.current
      if (e.key === 'Escape') { setEvolve(null); return }
      if (!p || guide || cutscene) return
      if (e.key === 'D' && e.shiftKey) { dispatch({ type: a.inDemo ? 'exitDemo' : 'enterDemo' }); return }
      if (e.key === 'p' || e.key === 'P') { petTapRef.current(); return }
      if (e.key === '+' || e.key === '=') { camApi.current.zoom?.(0.8); return }
      if (e.key === '-' || e.key === '_') { camApi.current.zoom?.(1.25); return }
      if (e.key === 'ArrowLeft') { camApi.current.rotate?.(-0.5); e.preventDefault(); return }
      if (e.key === 'ArrowRight') { camApi.current.rotate?.(0.5); e.preventDefault(); return }
      if (e.key === '0') { camApi.current.reset?.(); return }
      const n = Number(e.key)
      if (n >= 1 && n <= 7) { dispatch({ type: 'tick', id: habitList[n - 1].id }); return }
      const q = 'abc'.indexOf(e.key.toLowerCase())
      if (q >= 0 && e.key.length === 1) {
        const ques = questionFor(t)
        if (q < ques.options.length) dispatch({ type: 'quiz', choice: q, correct: ques.answer })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, bump])

  const petTap = () => {
    const now = Date.now()
    taps.current = [...taps.current.filter((t) => now - t < 2500), now]
    bump('bounce', 'leaves')
    petCtl.current.hold?.(2.2)
    if (taps.current.length === 3) powerUp(6) // hidden: three quick pats charge the pet up

  }

  petTapRef.current = petTap

  if (splash) return <Splash onDone={endSplash} />
  if (!app.real && !app.inDemo) return <Onboarding reduced={reduced} onHatch={(name, sprite) => { dispatch({ type: 'hatch', name, sprite }); tutorialStorage.set('in-progress'); setTutorial('in-progress') }} />
  if (!pet) return null

  const mood = moodFor(pet.health)
  const stage = stageIndex(pet.xp)
  const done = habitsDone(pet, today)
  const garden = Math.min(15, 3 + Object.values(pet.counts).reduce((a, b) => a + b, 0))

  return (
    <SpriteProvider value={pet.pet.sprite}>
    <main className="home">
      <header className="glass top">
        <div className="top-l">
          <p className="eyebrow"><Icon name="leaf" size={16} />Sustain-a-Pet</p>
          <div className="name-row">
            <h1>{pet.pet.name}</h1>
            {app.inDemo && <span className="pill demo">Demo</span>}
          </div>
        </div>
        <div className="top-r">
          <span className="stage-label"><Icon name="drop" size={20} />{['Seed', 'Sprout', 'Sapling', 'Guardian'][stage]}</span>
          <span className={`pill mood mood-${mood.toLowerCase()}`}><Icon name="sprout" size={18} />{mood}</span>
        </div>
      </header>

      {app.awayDays >= 2 && !app.inDemo && (
        <div className="banner" role="status">
          Welcome back! {pet.pet.name} missed you. Tick a habit and it will perk right up.
          <button onClick={() => dispatch({ type: 'dismissAway' })} aria-label="Dismiss">×</button>
        </div>
      )}
      {app.awayDays >= 2 && app.inDemo && (
        <div className="banner" role="status">Welcome back! {pet.pet.name} missed you.<button onClick={() => dispatch({ type: 'dismissAway' })} aria-label="Dismiss">×</button></div>
      )}

      <section className={`pet-stage mood-${mood.toLowerCase()}`} aria-label={`${pet.pet.name}'s world`}>
        <SceneBoundary><Suspense fallback={<div className="loading">Waking up {pet.pet.name}…</div>}>
          <PetCanvas orbit api={camApi} follow={{ get current() { return petCtl.current.pos } }} stage={stage} camera={{ position: [0, 7.7, 8.4], fov: 48 }} target={[0, 0.7, 0]}>
            <World key={pet.game.activeArea} ctl={petCtl} area={pet.game.activeArea} decorations={pet.game.decorations} projects={pet.game.projects} garden={garden} reduced={reduced} habits={habitList} done={done} today={today} quizResult={pet.days[today]?.quiz}
              onHabit={(id) => dispatch({ type: 'tick', id })} onQuizAnswer={(choice, correct) => dispatch({ type: 'quiz', choice, correct })}
              onFlower={() => { bump('leaves'); powerUp(3.5) }} onShroom={() => bump('bounce')} />
            <PetModel sprite={pet.pet.sprite} stage={stage} mood={mood} fx={fx} reduced={reduced} ctl={petCtl} onPat={petTap} />
          </PetCanvas>
        </Suspense></SceneBoundary>
        <div className="world-guide" aria-live="polite">
          <span className="world-guide-icon" aria-hidden="true">✧</span>
          <span><strong>{AREAS.find(area => area.id === pet.game.activeArea)?.name} <em>{done.length}/{habitList.length}</em></strong><small>{done.length === habitList.length ? 'Wonderful work. Your garden is thriving.' : 'Tap a mushroom, then complete its quest.'}</small></span>
        </div>
        <div className="world-tools" aria-label="Garden camera">
          <button aria-label="Zoom out" onClick={() => camApi.current.zoom?.(1.25)}>−</button>
          <button aria-label="Reset garden camera" onClick={() => camApi.current.reset?.()}><Icon name="refresh" size={16} /></button>
          <button aria-label="Zoom in" onClick={() => camApi.current.zoom?.(.8)}>+</button>
        </div>
        <LeafFootsteps movement={petCtl} enabled />
        {tutorial === 'in-progress' && <QuickGuide onFinish={finishTutorial} />}
        <Rewards floats={floats} toasts={toasts} evolve={evolve} onCloseEvolve={() => setEvolve(null)} petName={pet.pet.name} xp={pet.xp} doneCount={done.length} total={habitList.length} />
      </section>
      <div className="sr-only" aria-live="polite">{live}</div>

      <Vitals health={pet.health} xp={pet.xp} doneToday={done.length} totalHabits={habitList.length} />
      <GardenJournal inDemo={app.inDemo} state={pet} today={today} dispatch={dispatch} />
      <p className="hint kbd-hint">Keys: 1–7 habits · A/B/C quiz</p>
      {app.inDemo && (
        <DemoDrawer date={today} offset={app.offset} onSkip={(days) => dispatch({ type: 'skipDay', days })}
          onXp={(amount) => dispatch({ type: 'addXp', amount })} onReset={() => dispatch({ type: 'resetDemo' })} onExit={() => dispatch({ type: 'exitDemo' })} />
      )}
    </main>
    </SpriteProvider>
  )
}
