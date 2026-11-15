import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STAGES } from '../engine.js'
import { Mascot, StatTile } from './Duo.jsx'
import accessories from '../data/accessories.json'

/** Floating "+XP" chips over the pet, toasts for unlocks/streaks, and the stage-up cutscene. */
export default function Rewards({ floats, toasts, evolve, onCloseEvolve, petName, xp = 0, doneCount = 0, total = 7 }) {
  return (
    <>
      <div className="floats" aria-hidden="true">
        {floats.map((f) => <span key={f.id} className="float" style={{ left: `${f.x}%` }}>+{f.xp} XP</span>)}
      </div>
      <ToastStack toasts={toasts} />
      {evolve && <EvolveCutscene stage={evolve.stage} name={petName} xp={xp} doneCount={doneCount} total={total} onClose={onCloseEvolve} />}
    </>
  )
}

function EvolveCutscene({ stage, name, xp, doneCount, total, onClose }) {
  const first = useRef(null)
  useEffect(() => { first.current?.focus() }, [])
  return createPortal(
    <div className="evolve complete-screen" role="dialog" aria-modal="true" aria-label="Your pet evolved">
      <div className="complete-hero"><span className="sparkle s1" /><span className="sparkle s2" /><span className="sparkle s3" /><Mascot size={200} className="complete-mascot" /></div>
      <h2 className="complete-title">{STAGES[stage]}!</h2>
      <p className="complete-sub">{name} evolved. All that small care is paying off.</p>
      <div className="stat-row">
        <StatTile tone="gold" label="TOTAL XP">⚡ {xp}</StatTile>
        <StatTile tone="green" label="STAGE">{STAGES[stage]}</StatTile>
        <StatTile tone="blue" label="HABITS">{doneCount}/{total}</StatTile>
      </div>
      <button ref={first} type="button" className="duo-btn blue" onClick={onClose}>Claim XP</button>
    </div>,
    document.body,
  )
}

export const unlockText = (id) => `Unlocked: ${accessories.find((a) => a.id === id)?.name ?? id}!`

/** Retain exiting rows and animate each measured position from its current transform. */
function ToastStack({ toasts }) {
  const [rows, setRows] = useState(() => toasts.map((t) => ({ ...t, leaving: false })))
  const refs = useRef(new Map())
  const [positions, setPositions] = useState({})
  useEffect(() => {
    const active = new Set(toasts.map((t) => t.id))
    setRows((previous) => [
      ...toasts.map((toast) => ({ ...toast, leaving: false })),
      ...previous.filter((toast) => !active.has(toast.id)).map((toast) => ({ ...toast, leaving: true })),
    ])
    const timer = setTimeout(() => setRows((previous) => previous.filter((toast) => !toast.leaving)), 400)
    return () => clearTimeout(timer)
  }, [toasts])
  useLayoutEffect(() => {
    let offset = 0
    const next = {}
    rows.forEach((row) => {
      if (row.leaving) return
      next[row.id] = offset
      offset += (refs.current.get(row.id)?.offsetHeight || 38) + 6
    })
    setPositions((previous) => ({ ...previous, ...next }))
  }, [rows])
  return <div className="toasts" role="status" aria-live="polite">
    {rows.map((toast) => <div key={toast.id} ref={(node) => { if (node) refs.current.set(toast.id, node); else refs.current.delete(toast.id) }}
      className={`toast toast-positioned ${toast.leaving ? 'is-leaving' : ''}`} aria-hidden={toast.leaving}
      style={{ transform: `translate(-50%, ${positions[toast.id] ?? 0}px)` }}>{toast.text}</div>)}
  </div>
}
