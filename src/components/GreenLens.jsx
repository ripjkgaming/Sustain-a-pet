import FitContent from './FitContent.jsx'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mascot } from './Duo.jsx'
import Icon from './Icons.jsx'
import {
  MAX_TEXT, MESSAGES, PRIVACY_NOTICE, aiDailyUsed, aiQuestLists, completeEcoQuest, completionNotice, confidenceCopy, describeError,
  downscaleImage, fallbackBadge, hasPrivacyAck, loadPlace, recentHistory, requestEcoQuest, rewardView, savePlace, savePrivacyAck,
  sourcesView,
} from '../greenLensClient.js'
import { MAX_LOCATION_CHARS } from '../ecoQuestConfig.js'
import { useOnline } from '../resilience.js'
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

function Reward({ reward }) {
  return <span className="gl-reward">
    <span className="gl-xp">+{reward.xp} XP</span>
    <span className="gl-reward-extra"><b aria-hidden="true">◉</b> +{reward.coins}<span className="sr-only"> coins</span></span>
    {reward.leaves > 0 && <span className="gl-reward-extra"><Icon name="leaf" size={13} /> +{reward.leaves}<span className="sr-only"> {reward.leaves === 1 ? 'leaf' : 'leaves'}</span></span>}
  </span>
}

/** Curated recycling links chosen by the server, or the note saying none cover this place. */
function Sources({ quest }) {
  const { links, note } = sourcesView(quest)
  if (!links.length && !note) return null
  return <div className="gl-sources">
    <span className="gl-kicker">Check local rules</span>
    {links.length > 0
      ? <ul>{links.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<span className="sr-only"> (opens in a new tab)</span></a>{s.publisher !== s.title && <small>{s.publisher}</small>}</li>)}</ul>
      : <p>{note}. Check your local council or authority before you recycle.</p>}
  </div>
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
  const [ack, setAck] = useState(() => hasPrivacyAck())
  const [place, setPlace] = useState(() => loadPlace())
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null) // { id, text } for a rejected completion
  const online = useOnline()
  const rootRef = useRef(null)
  const headRef = useRef(null)
  const textRef = useRef(null)
  const answerRef = useRef(null)
  const lastInput = useRef(null)
  const inflight = useRef(null)
  const baseId = useId()
  const ids = { title: `${baseId}t`, mine: `${baseId}m`, text: `${baseId}x`, hint: `${baseId}h`, camera: `${baseId}c`, gallery: `${baseId}g`, place: `${baseId}p`, answer: `${baseId}a`, privacy: `${baseId}v` }

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
    setPhase('loading'); setQuest(null); setErrorCode(null); setConfirmId(null); setNotice(null)
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
      lastInput.current = { ...input, file: undefined, image }
      setPreview(image)
    }
    const location = savePlace(place)
    const res = await requestEcoQuest({ image, text: input.text, clarification: input.clarification, history: recentHistory(game), location }, { signal: controller.signal })
    if (controller.signal.aborted || res.code === 'aborted') return
    inflight.current = null
    if (!res.ok) { fail(res.code); return }
    if (res.kind === 'clarify') {
      // Only one round: a second question after an answer is treated as unusable output.
      if (input.clarification) { fail('invalid_model_output'); return }
      setQuestion(res.question); setAnswer(''); setPhase('clarify')
      setStatus(`One quick question: ${res.question}`)
      requestAnimationFrame(() => answerRef.current?.focus())
      return
    }
    setQuest(res.quest); setPhase('result')
    dispatch({ type: 'refreshAiQuestToken', quest: res.quest })
    const badge = fallbackBadge(res.quest)
    setStatus(`Found a quest: ${res.quest.title}. ${res.quest.confidence_label || ''}${badge ? ` ${badge}.` : ''}`)
    focusHead()
  }

  const onFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same photo be picked again
    if (!file || !ack) return
    if (!online) { fail('offline'); return }
    setPreview(null)
    look({ file, text })
  }

  const onSubmitText = (event) => {
    event.preventDefault()
    if (!ack) return
    if (!online) { fail('offline'); return }
    if (!text.trim()) { textRef.current?.focus(); return }
    setPreview(null)
    look({ text })
  }

  const acknowledge = () => {
    savePrivacyAck()
    setAck(true)
    setStatus('Thanks. GreenLens is ready.')
    focusHead()
  }

  const sendAnswer = (event, skip = false) => {
    event?.preventDefault()
    const reply = skip ? 'Not sure' : answer.trim()
    if (!reply) { answerRef.current?.focus(); return }
    look({ ...lastInput.current, clarification: reply })
  }

  const describeInstead = () => {
    setPhase('capture'); setPreview(null)
    requestAnimationFrame(() => textRef.current?.focus())
  }

  const startOver = () => {
    inflight.current?.abort(); inflight.current = null
    setPhase('capture'); setQuest(null); setPreview(null); setErrorCode(null); setQuestion(''); setAnswer('')
    setStatus('Ready to look again.')
    focusHead()
  }

  const addQuest = () => {
    if (!quest || saved) return
    dispatch({ type: 'addAiQuest', quest })
    setStatus(`Added “${quest.title}” to your quests.`)
  }

  // The server confirms the completion and decides the reward; the client only shows what it returns.
  const complete = async (q) => {
    if (cap.left <= 0 || busyId) return
    setBusyId(q.id); setNotice(null)
    setStatus('Checking with GreenLens…')
    const res = await completeEcoQuest(q)
    setBusyId(null)
    if (!res.ok) {
      const text = completionNotice(res.code)
      setConfirmId(null); setNotice({ id: q.id, text }); setStatus(text)
      return
    }
    dispatch({ type: 'completeAiQuest', id: q.id, reward: res.reward })
    setConfirmId(null)
    setCheer({ title: q.title, ...res.reward })
    setPhase('celebrate')
    setStatus(`Quest complete: ${q.title}. Plus ${res.reward.xp} XP, ${res.reward.coins} coins${res.reward.leaves ? ` and ${res.reward.leaves} leaf` : ''}.`)
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
  const badge = fallbackBadge(quest)
  const gated = phase === 'capture' && !ack
  const heading = gated ? 'Before you snap' : { loading: 'Looking around…', clarify: 'One quick question', result: 'Here’s a little quest', error: err?.title, celebrate: 'Quest complete!' }[phase] || 'What’s near you?'
  const showMine = phase !== 'loading' && phase !== 'celebrate' && !gated && (open.length > 0 || done.length > 0)

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

      <FitContent className="gl-scroll" align={phase === 'celebrate' || phase === 'loading' ? 'center' : 'start'}>
        <h2 id={ids.title} ref={headRef} tabIndex={-1} className="gl-title">{heading}</h2>

        {gated && <div className="gl-panel" key="privacy">
          <div className="gl-privacy" id={ids.privacy}>
            <span className="gl-privacy-icon" aria-hidden="true"><Icon name="lock" size={22} /></span>
            <p>{PRIVACY_NOTICE}</p>
          </div>
          <button type="button" className="duo-btn green" onClick={acknowledge} aria-describedby={ids.privacy}>Got it</button>
          <button type="button" className="gl-text-btn" onClick={onClose}>Not now</button>
        </div>}

        {phase === 'capture' && ack && <div className="gl-panel" key="capture">
          <p className="gl-lede">Snap something you use every day. GreenLens suggests one small, safe thing to do about it today.</p>
          <p className="gl-privacy-line"><Icon name="lock" size={13} />Sent to an AI model via OpenRouter to write your tip.</p>
          {!online && <div className="gl-offline" role="status">
            <p>{MESSAGES.offline} Finding new quests needs the internet. Your habits, quiz and saved quests still work.</p>
            <button type="button" className="gl-ghost-btn" onClick={() => setStatus(navigator.onLine === false ? MESSAGES.offline : 'Back online. GreenLens is ready.')}>Try again</button>
          </div>}
          <label className={`gl-finder ${online ? '' : 'is-off'}`} htmlFor={ids.camera}>
            <input id={ids.camera} className="gl-file" type="file" accept="image/*" capture="environment" onChange={onFile} disabled={!online} />
            <span className="gl-corners" aria-hidden="true"><i /><i /><i /><i /></span>
            <Mascot size={96} className="gl-finder-mascot" />
            <span className="gl-finder-cta"><CameraGlyph />Take a photo</span>
          </label>
          <label className={`gl-gallery ${online ? '' : 'is-off'}`} htmlFor={ids.gallery}>
            <input id={ids.gallery} className="gl-file" type="file" accept="image/*" onChange={onFile} disabled={!online} />
            Choose from your photos instead
          </label>

          <div className="gl-or" aria-hidden="true" />

          <form className="gl-describe" onSubmit={onSubmitText}>
            <label htmlFor={ids.text}>Or describe something</label>
            <textarea id={ids.text} ref={textRef} rows={2} maxLength={MAX_TEXT} value={text} aria-describedby={ids.hint}
              placeholder="e.g. a stack of takeaway cups by the sink" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit() } }} />
            <small id={ids.hint} className="gl-hint">{text.length > 150 ? `${MAX_TEXT - text.length} characters left.` : 'Works without a camera, too.'}</small>
            <button type="submit" className="duo-btn green" disabled={!online || !text.trim()}>Find a quest</button>
          </form>
          <div className="gl-place">
            <label htmlFor={ids.place}>Town or region <small>(optional, for recycling links)</small></label>
            <input id={ids.place} type="text" maxLength={MAX_LOCATION_CHARS} autoComplete="address-level2" value={place}
              placeholder="e.g. Ontario" onChange={(e) => setPlace(e.target.value)} />
          </div>
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

        {phase === 'clarify' && <div className="gl-panel" key="clarify">
          <div className="gl-error gl-ask">
            <Mascot size={56} className="gl-error-mascot" />
            <p>{question}</p>
          </div>
          <form className="gl-describe" onSubmit={sendAnswer}>
            <label htmlFor={ids.answer}>Your answer</label>
            <textarea id={ids.answer} ref={answerRef} rows={2} maxLength={MAX_TEXT} value={answer} onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit() } }} />
            <button type="submit" className="duo-btn green" disabled={!answer.trim()}>Get my quest</button>
          </form>
          <button type="button" className="gl-text-btn" onClick={() => sendAnswer(null, true)}>Not sure, skip</button>
        </div>}

        {phase === 'result' && quest && <div className="gl-panel" key="result">
          <article className="gl-quest">
            {badge && <p className="gl-fallback"><Icon name="refresh" size={14} />{badge}</p>}
            <div className="gl-spotted">
              {preview ? <img src={preview} alt="Your photo" /> : <span className="gl-spotted-icon" aria-hidden="true"><Icon name="spark" size={22} /></span>}
              <div className="gl-spotted-copy"><span className="gl-kicker">I spotted</span><strong>{quest.object}</strong></div>
              <ConfidenceBadge confidence={quest.confidence} />
            </div>
            <p className={`gl-caveat is-${quest.confidence}`}><span aria-hidden="true" />{quest.confidence_label || conf.note}{quest.caveat ? ` ${quest.caveat}` : ''}</p>
            <h3 className="gl-quest-title">{quest.title}</h3>
            <p className="gl-action">{quest.action}</p>
            <div className="gl-why"><span className="gl-kicker">Why this helps</span><p>{quest.why}</p></div>
            {quest.personalization_note && <p className="gl-personal"><Icon name="sprout" size={15} />{quest.personalization_note}</p>}
            <Sources quest={quest} />
            <Reward reward={rewardView(quest.reward, quest.xp)} />
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
          {err.retry && <button type="button" className="duo-btn green" onClick={() => look(lastInput.current)}>Try again</button>}
          {err.fallback && <button type="button" className={err.retry ? 'gl-ghost-btn' : 'duo-btn green'} onClick={describeInstead}>Describe it in words</button>}
          <button type="button" className="gl-text-btn" onClick={startOver}>Start over</button>
        </div>}

        {phase === 'celebrate' && cheer && <div className="gl-panel gl-cheer" key="celebrate">
          <div className="gl-cheer-hero" aria-hidden="true">
            <span className="sparkle s1" /><span className="sparkle s2" /><span className="sparkle s3" />
            <Mascot size={150} className="gl-cheer-mascot" />
          </div>
          <p className="gl-lede gl-center"><q>{cheer.title}</q>, done in real life. {petName} is so proud of you.</p>
          <Reward reward={rewardView(cheer, cheer.xp)} />
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
              const rowNotice = notice?.id === q.id ? notice.text : ''
              return <li key={q.id} className={`gl-row ${confirming ? 'is-confirming' : ''}`}>
                <div className="gl-row-main">
                  <div className="gl-row-copy">
                    <strong>{q.title}</strong>
                    <p>{q.action}</p>
                    <span className="gl-xp small">+{q.xp} XP</span>
                    {fallbackBadge(q) && <span className="gl-fallback-tag">Prerecorded tip</span>}
                  </div>
                  {!confirming && <button type="button" className="gl-did" disabled={cap.left <= 0} onClick={() => setConfirmId(q.id)}
                    aria-label={cap.left <= 0 ? `${q.title}: come back tomorrow` : `I did it: ${q.title}`}>{cap.left <= 0 ? 'Tomorrow' : 'I did it'}</button>}
                </div>
                {confirming && <div className="gl-confirm" role="group" aria-label={`Confirm: ${q.title}`}>
                  <p><strong>Really done?</strong> {HONEST_LINE}</p>
                  <div className="gl-confirm-actions">
                    <button type="button" className="gl-confirm-no" onClick={() => setConfirmId(null)} disabled={busyId === q.id}>Not yet</button>
                    {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- focus must move to the confirm the user just opened */}
                    <button type="button" className="gl-confirm-yes" onClick={() => complete(q)} disabled={busyId === q.id} autoFocus>{busyId === q.id ? 'Checking…' : 'Yes, I did it'}</button>
                  </div>
                </div>}
                {rowNotice && <p className="gl-row-notice" role="status">{rowNotice}</p>}
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
      </FitContent>
      <div className="sr-only" role="status" aria-live="polite">{status}</div>
    </div>,
    host,
  )
}
