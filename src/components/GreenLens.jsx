import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mascot } from './Duo.jsx'
import Icon from './Icons.jsx'
import {
  MAX_TEXT, aiDailyUsed, aiQuestLists, confidenceCopy, describeError, downscaleImage, requestEcoQuest,
} from '../greenLensClient.js'
import '../greenlens.css'

const HONEST_LINE = 'A photo can’t prove it — tap only when you really did it.'
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/** Entry card for the Today tab. */
export function GreenLensCard({ game, today, onOpen }) {
  const { open } = aiQuestLists(game)
  const { used, max } = aiDailyUsed(game, today)
  return <button type="button" className="gl-card" onClick={onOpen} aria-haspopup="dialog">
    <span className="gl-card-lens" aria-hidden="true"><LensGlyph /></span>
    <span className="gl-card-copy">
      <span className="gl-card-kicker">GREENLENS</span>
      <strong>Point, snap, do one good thing</strong>
      <small>Show GreenLens something near you and get a tiny real-world eco quest.</small>
    </span>
    <span className="gl-card-meta">
      {open.length > 0 && <span className="gl-card-open">{open.length} open</span>}
      <span className="gl-card-cap">{used}/{max}<span className="sr-only"> GreenLens quests done</span> today</span>
    </span>
  </button>
}

function LensGlyph({ size = 34 }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    <path d="M6 13V9a3 3 0 0 1 3-3h4M27 6h4a3 3 0 0 1 3 3v4M34 27v4a3 3 0 0 1-3 3h-4M13 34H9a3 3 0 0 1-3-3v-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M13 26c0-7.5 4.8-12.5 14-12.5 0 8.5-5.6 12.5-14 12.5zm0 0c2.6-3.4 5.4-5.8 9-7.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

function CameraGlyph() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
}

function ConfidenceBadge({ confidence }) {
  const level = { high: 3, medium: 2, low: 1 }[confidence] || 1
  const { label } = confidenceCopy(confidence)
  return <span className={`gl-confidence is-${confidence}`}>
    <span className="gl-confidence-dots" aria-hidden="true">{[1, 2, 3].map((n) => <i key={n} className={n <= level ? 'on' : ''} />)}</span>
    {label}<span className="sr-only"> ({confidence} confidence)</span>
  </span>
}

function Reward({ xp }) {
  return <span className="gl-reward">
    <span className="gl-xp">+{xp} XP</span>
    <span className="gl-reward-extra"><b aria-hidden="true">◉</b> +{xp + 5}<span className="sr-only"> coins</span></span>
    <span className="gl-reward-extra"><Icon name="leaf" size={13} /> +1<span className="sr-only"> leaf</span></span>
  </span>
}

/**
 * Full-screen GreenLens flow: capture (photo or words), looking, quest card, my quests, honest "I did it".
 * The reducer owns rewards and the daily cap; this screen only dispatches addAiQuest / completeAiQuest.
 */
export default function GreenLens({ game, today, petName = 'Your pet', dispatch, onClose, onCelebrate }) {
  const [phase, setPhase] = useState('capture') // capture | loading | result | error | celebrate
  const [text, setText] = useState('')
  const [preview, setPreview] = useState(null)
  const [asked, setAsked] = useState('')
  const [quest, setQuest] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [cheer, setCheer] = useState(null)
  const [status, setStatus] = useState('')
  const rootRef = useRef(null)
  const headRef = useRef(null)
  const textRef = useRef(null)
  const lastInput = useRef(null)
  const inflight = useRef(null)
  const baseId = useId()
  const ids = { title: `${baseId}t`, mine: `${baseId}m`, text: `${baseId}x`, hint: `${baseId}h`, camera: `${baseId}c`, gallery: `${baseId}g` }

  const { open, done } = aiQuestLists(game)
  const cap = aiDailyUsed(game, today)
  const saved = quest ? (game?.aiQuests ?? []).find((q) => q.id === quest.id) : null

  useEffect(() => {
    headRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; inflight.current?.abort() }
  }, [])

  const focusHead = () => requestAnimationFrame(() => headRef.current?.focus())

  function fail(code) {
    inflight.current = null
    setErrorCode(code); setPhase('error')
    setStatus(describeError(code).title)
    focusHead()
  }

  async function look(input) {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    lastInput.current = input
    setPhase('loading'); setQuest(null); setErrorCode(null); setConfirmId(null)
    setAsked(input.text?.trim() || '')
    setStatus('Looking around…')
    let image = input.image
    if (input.file) {
      try {
        image = await downscaleImage(input.file)
      } catch {
        if (!controller.signal.aborted) fail('image_unreadable')
        return
      }
      if (controller.signal.aborted) return
      lastInput.current = { image, text: input.text }
      setPreview(image)
    }
    const res = await requestEcoQuest({ image, text: input.text }, { signal: controller.signal })
    if (controller.signal.aborted || res.code === 'aborted') return
    inflight.current = null
    if (!res.ok) { fail(res.code); return }
    setQuest(res.quest); setPhase('result')
    setStatus(`Found a quest: ${res.quest.title}. Plus ${res.quest.xp} XP.`)
    focusHead()
  }

  const onFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same photo be picked again
    if (!file) return
    setPreview(null)
    look({ file, text })
  }

  const onSubmitText = (event) => {
    event.preventDefault()
    if (!text.trim()) { textRef.current?.focus(); return }
    setPreview(null)
    look({ text })
  }

  const describeInstead = () => {
    setPhase('capture'); setPreview(null)
    requestAnimationFrame(() => textRef.current?.focus())
  }

  const startOver = () => {
    inflight.current?.abort(); inflight.current = null
    setPhase('capture'); setQuest(null); setPreview(null); setErrorCode(null)
    setStatus('Ready to look again.')
    focusHead()
  }

  const addQuest = () => {
    if (!quest || saved) return
    dispatch({ type: 'addAiQuest', quest })
    setStatus(`Added “${quest.title}” to your quests.`)
  }

  const complete = (q) => {
    if (cap.left <= 0) return
    dispatch({ type: 'completeAiQuest', id: q.id })
    setConfirmId(null)
    setCheer({ title: q.title, xp: q.xp })
    setPhase('celebrate')
    setStatus(`Quest complete: ${q.title}. Plus ${q.xp} XP, ${q.xp + 5} coins and 1 leaf.`)
    focusHead()
  }

  const backToGarden = () => { onClose(); onCelebrate?.(cheer) }

  const onKeyDown = (event) => {
    event.stopPropagation() // keep garden shortcuts (1–7, A/B/C, Esc) from firing underneath
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirmId) setConfirmId(null)
      else onClose()
      return
    }
    if (event.key !== 'Tab') return
    const nodes = [...rootRef.current.querySelectorAll(FOCUSABLE)].filter((node) => node.getClientRects().length > 0)
    if (!nodes.length) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === headRef.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
  }

  const err = errorCode ? describeError(errorCode) : null
  const conf = quest ? confidenceCopy(quest.confidence, quest.caveat) : null
  const heading = { loading: 'Looking around…', result: 'Here’s a little quest', error: err?.title, celebrate: 'Quest complete!' }[phase] || 'What’s near you?'
  const showMine = phase !== 'loading' && phase !== 'celebrate' && (open.length > 0 || done.length > 0)

  const host = document.querySelector('.screen') || document.body

  return createPortal(
    <div ref={rootRef} className={`gl-screen is-${phase}`} role="dialog" aria-modal="true" aria-labelledby={ids.title} onKeyDown={onKeyDown}>
      <header className="gl-top">
        <button type="button" className="gl-close" aria-label="Close GreenLens" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <span className="gl-brand"><LensGlyph size={20} />GreenLens</span>
        <span className={`gl-cap ${cap.left === 0 ? 'is-full' : ''}`}>
          <span className="gl-cap-dots" aria-hidden="true">{Array.from({ length: cap.max }, (_, i) => <i key={i} className={i < cap.used ? 'on' : ''} />)}</span>
          {cap.used}/{cap.max}<span className="sr-only"> GreenLens quests done</span> today
        </span>
      </header>

      <div className="gl-scroll">
        <h2 id={ids.title} ref={headRef} tabIndex={-1} className="gl-title">{heading}</h2>

        {phase === 'capture' && <div className="gl-panel" key="capture">
          <p className="gl-lede">Snap something you use every day. GreenLens suggests one small, safe thing to do about it today.</p>
          <label className="gl-finder" htmlFor={ids.camera}>
            <input id={ids.camera} className="gl-file" type="file" accept="image/*" capture="environment" onChange={onFile} />
            <span className="gl-corners" aria-hidden="true"><i /><i /><i /><i /></span>
            <Mascot size={96} className="gl-finder-mascot" />
            <span className="gl-finder-cta"><CameraGlyph />Take a photo</span>
          </label>
          <label className="gl-gallery" htmlFor={ids.gallery}>
            <input id={ids.gallery} className="gl-file" type="file" accept="image/*" onChange={onFile} />
            Choose from your photos instead
          </label>

          <div className="gl-or" aria-hidden="true" />

          <form className="gl-describe" onSubmit={onSubmitText}>
            <label htmlFor={ids.text}>Or describe something</label>
            <textarea id={ids.text} ref={textRef} rows={2} maxLength={MAX_TEXT} value={text} aria-describedby={ids.hint}
              placeholder="e.g. a stack of takeaway cups by the sink" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit() } }} />
            <small id={ids.hint} className="gl-hint">{text.length > 150 ? `${MAX_TEXT - text.length} characters left.` : 'Works without a camera, too.'}</small>
            <button type="submit" className="duo-btn green" disabled={!text.trim()}>Find a quest</button>
          </form>
        </div>}

        {phase === 'loading' && <div className="gl-panel gl-looking" key="loading">
          <div className="gl-finder is-scanning" aria-hidden="true">
            {preview ? <img src={preview} alt="" /> : <Mascot size={110} className="gl-finder-mascot" />}
            <span className="gl-corners"><i /><i /><i /><i /></span>
            <span className="gl-sweep" />
          </div>
          <p className="gl-lede gl-center">{preview || !asked ? 'Peering closely for one small, good thing to do.' : <>Thinking about <q>{asked}</q></>}</p>
          <button type="button" className="gl-text-btn" onClick={startOver}>Cancel</button>
        </div>}

        {phase === 'result' && quest && <div className="gl-panel" key="result">
          <article className="gl-quest">
            <div className="gl-spotted">
              {preview ? <img src={preview} alt="Your photo" /> : <span className="gl-spotted-icon" aria-hidden="true"><Icon name="spark" size={22} /></span>}
              <div className="gl-spotted-copy"><span className="gl-kicker">I spotted</span><strong>{quest.object}</strong></div>
              <ConfidenceBadge confidence={quest.confidence} />
            </div>
            {conf.note && <p className={`gl-caveat is-${quest.confidence}`}><span aria-hidden="true" />{conf.note}</p>}
            <h3 className="gl-quest-title">{quest.title}</h3>
            <p className="gl-action">{quest.action}</p>
            <div className="gl-why"><span className="gl-kicker">Why this helps</span><p>{quest.why}</p></div>
            <Reward xp={quest.xp} />
          </article>
          {saved
            ? <p className="gl-added" role="status"><span aria-hidden="true">✓</span>{saved.status === 'done' ? 'You already did this one. Lovely.' : 'Added below. Do it for real, then tap “I did it”.'}</p>
            : <button type="button" className="duo-btn green" onClick={addQuest}>Add to my quests</button>}
          <button type="button" className="gl-text-btn" onClick={startOver}>Look at something else</button>
        </div>}

        {phase === 'error' && err && <div className="gl-panel" key="error">
          <div className="gl-error">
            <Mascot size={64} className="gl-error-mascot" />
            <p>{err.body}</p>
          </div>
          {err.setup && <div className="gl-setup">
            <span className="gl-kicker">To wake it up</span>
            <ol>
              <li>Copy <code>.env.example</code> to <code>.env</code></li>
              <li>Fill in <code>GEMINI_API_KEY</code></li>
              <li>Restart <code>npm run dev</code></li>
            </ol>
            <small>Deployed? Add <code>GEMINI_API_KEY</code> to your host’s environment variables. Habits and quests keep working meanwhile.</small>
          </div>}
          {err.retry && <button type="button" className="duo-btn green" onClick={() => look(lastInput.current)}>Try again</button>}
          {err.fallback && <button type="button" className={err.retry ? 'gl-ghost-btn' : 'duo-btn green'} onClick={describeInstead}>Describe it in words</button>}
          <button type="button" className="gl-text-btn" onClick={startOver}>{err.setup ? 'Back' : 'Start over'}</button>
        </div>}

        {phase === 'celebrate' && cheer && <div className="gl-panel gl-cheer" key="celebrate">
          <div className="gl-cheer-hero" aria-hidden="true">
            <span className="sparkle s1" /><span className="sparkle s2" /><span className="sparkle s3" />
            <Mascot size={150} className="gl-cheer-mascot" />
          </div>
          <p className="gl-lede gl-center"><q>{cheer.title}</q>, done in real life. {petName} is so proud of you.</p>
          <Reward xp={cheer.xp} />
          <button type="button" className="duo-btn green" onClick={backToGarden}>Back to the garden</button>
          <button type="button" className="gl-text-btn" onClick={startOver}>Find another quest</button>
        </div>}

        {showMine && <section className="gl-mine" aria-labelledby={ids.mine}>
          <div className="gl-mine-head">
            <h3 id={ids.mine}>My GreenLens quests</h3>
            <small>{cap.left > 0 ? `${cap.left} ${cap.left === 1 ? 'reward' : 'rewards'} left today` : 'All rewards collected today'}</small>
          </div>
          <p className="gl-honest">Do it in real life first, then tap “I did it”.</p>
          <ul className="gl-list">
            {open.map((q) => {
              const confirming = confirmId === q.id
              return <li key={q.id} className={`gl-row ${confirming ? 'is-confirming' : ''}`}>
                <div className="gl-row-main">
                  <div className="gl-row-copy">
                    <strong>{q.title}</strong>
                    <p>{q.action}</p>
                    <span className="gl-xp small">+{q.xp} XP</span>
                  </div>
                  {!confirming && <button type="button" className="gl-did" disabled={cap.left <= 0} onClick={() => setConfirmId(q.id)}
                    aria-label={cap.left <= 0 ? `${q.title}: come back tomorrow` : `I did it: ${q.title}`}>{cap.left <= 0 ? 'Tomorrow' : 'I did it'}</button>}
                </div>
                {confirming && <div className="gl-confirm" role="group" aria-label={`Confirm: ${q.title}`}>
                  <p><strong>Really done?</strong> {HONEST_LINE}</p>
                  <div className="gl-confirm-actions">
                    <button type="button" className="gl-confirm-no" onClick={() => setConfirmId(null)}>Not yet</button>
                    {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- focus must move to the confirm the user just opened */}
                    <button type="button" className="gl-confirm-yes" onClick={() => complete(q)} autoFocus>Yes, I did it</button>
                  </div>
                </div>}
              </li>
            })}
            {done.map((q) => <li key={q.id} className="gl-row is-done">
              <div className="gl-row-main">
                <div className="gl-row-copy"><strong>{q.title}</strong></div>
                <span className="gl-done-tag"><span aria-hidden="true">✓</span> Done</span>
              </div>
            </li>)}
          </ul>
        </section>}
      </div>
      <div className="sr-only" role="status" aria-live="polite">{status}</div>
    </div>,
    host,
  )
}
