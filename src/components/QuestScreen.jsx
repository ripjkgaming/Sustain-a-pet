import { useEffect, useRef, useState } from 'react'
import habits from '../data/habits.json'
import FitContent from './FitContent.jsx'
import { questionFor } from './QuizCard.jsx'
import { FlowBar, Say } from './Duo.jsx'
import { sfx } from '../sfx.js'

const Check = ({ size = 22 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>

/** All quests as rows. Tapping a row opens that quest. */
export function QuestList({ done = [], onOpen }) {
  return (
    <ul className="quest-list">
      {habits.map((h) => {
        const isDone = done.includes(h.id)
        return (
          <li key={h.id}>
            <button type="button" className={`quest-row ${isDone ? 'is-done' : ''} ${h.id === 'quiz' ? 'is-gold' : ''}`} onClick={() => onOpen(h.id)}>
              <span className="quest-tick" aria-hidden="true">{isDone && <Check />}</span>
              <span className="quest-row-text">{h.demand}</span>
              <span className="quest-xp">+{h.xp}</span>
              <span className="sr-only">{isDone ? 'Done today' : 'Not done'}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function QuestScreen({ habit, done = [], today, quizResult, onComplete, onQuizAnswer, onClose, petName }) {
  const [curId, setCurId] = useState(habit ? habit.id : null)
  const [picked, setPicked] = useState(null)
  const [sheet, setSheet] = useState(null) // null | 'done' | 'right' | 'wrong'
  const root = useRef(null)
  const cur = habits.find((h) => h.id === curId) || null
  const isQuiz = cur?.id === 'quiz'
  const q = isQuiz ? questionFor(today) : null
  const isDone = cur ? done.includes(cur.id) : false
  const answered = isQuiz && !!quizResult
  const finished = isDone || answered

  const close = () => { sfx.close(); onClose() }
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })

  useEffect(() => {
    sfx.open()
    const prev = document.activeElement
    root.current?.focus()
    return () => prev?.focus?.()
  }, [])

  const open = (id) => { sfx.select(); setCurId(id); setPicked(null); setSheet(null) }
  const complete = () => { onComplete(cur.id); sfx.complete(); setSheet('done') }
  const check = () => {
    const ok = picked === q.answer
    onQuizAnswer(picked, q.answer)
    if (ok) sfx.correct()
    else sfx.wrong()
    setSheet(ok ? 'right' : 'wrong')
  }
  const pick = (i) => { if (finished || sheet) return; sfx.select(); setPicked(i) }

  const keyRef = useRef()
  useEffect(() => { keyRef.current = { isQuiz, finished, sheet, q, pick } })
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return }
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      const k = keyRef.current
      const i = 'abc'.indexOf(e.key.toLowerCase())
      if (k.isQuiz && i >= 0 && i < k.q.options.length) k.pick(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Keep Tab inside the dialog.
  const trap = (e) => {
    if (e.key !== 'Tab') return
    const f = [...root.current.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
    if (!f.length) return
    const first = f[0], last = f[f.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const doneCount = done.length
  const bar = <FlowBar value={doneCount / habits.length} close onBack={close} right={<b className="quest-count">{doneCount}/{habits.length}</b>} />

  let body
  if (!cur) {
    body = <>
      <h2 id="quest-title" className="quest-title">Quests</h2>
      <QuestList done={done} onOpen={open} />
    </>
  } else if (isQuiz && !finished) {
    body = <>
      <h2 id="quest-title" className="sr-only">Golden quest</h2>
      <Say>{q.demand}</Say>
      <div className="quest-reward gold">+{cur.xp} XP</div>
      <div className="quest-opts" role="group" aria-label="Answers">
        {q.options.map((o, i) => (
          <button key={o} type="button" aria-pressed={picked === i} disabled={!!sheet} className={`quest-opt ${picked === i ? 'sel' : ''}`} onClick={() => pick(i)}>
            <kbd aria-hidden="true">{'ABC'[i]}</kbd><span>{o}</span>
          </button>
        ))}
      </div>
    </>
  } else if (finished && !sheet) {
    body = <>
      <h2 id="quest-title" className="sr-only">{cur.demand}</h2>
      <Say>{isQuiz && quizResult === 'wrong' ? `Quiz done for today. Come back tomorrow, ${petName}'s ready!` : 'Done today. Rest easy.'}</Say>
      <div className="quest-calm"><span className="quest-calm-tick"><Check size={44} /></span><b>Done today</b><p>{cur.demand}</p></div>
    </>
  } else {
    body = <>
      <h2 id="quest-title" className="sr-only">{cur.demand}</h2>
      <Say>{cur.demand}</Say>
      <div className="quest-reward">+{cur.xp} XP</div>
    </>
  }

  const showCta = cur && !finished && !sheet
  const wrong = sheet === 'wrong'

  return (
    <div className="quest-screen" ref={root} role="dialog" aria-modal="true" aria-labelledby="quest-title" tabIndex={-1} onKeyDown={trap}>
      <div className="quest-top">{bar}</div>
      <FitContent className="quest-body" align="center">{body}</FitContent>
      {showCta && (isQuiz
        ? <div className="quest-foot"><button type="button" className="duo-btn green" disabled={picked === null} onClick={check}>Check</button></div>
        : <div className="quest-foot"><button type="button" className="duo-btn green" onClick={complete}>I did it</button></div>)}
      {!cur && <div className="quest-foot"><button type="button" className="duo-btn white" onClick={close}>Close</button></div>}
      {finished && !sheet && cur && <div className="quest-foot"><button type="button" className="duo-btn white" onClick={close}>Back</button></div>}
      {sheet && (
        <div className={`quest-sheet ${wrong ? 'bad' : 'good'}`} role="status">
          <strong><i aria-hidden="true">{wrong ? '✕' : '✓'}</i>{sheet === 'done' ? `Awesome! +${cur.xp} XP` : wrong ? 'Not quite, and that is fine' : `Awesome! +${cur.xp} XP`}</strong>
          {q && sheet !== 'done' && <p>{q.explain}</p>}
          {sheet === 'done' && <p>{cur.why}</p>}
          <button type="button" className={`duo-btn ${wrong ? 'orange' : 'green'}`} autoFocus onClick={close}>Continue</button>
        </div>
      )}
    </div>
  )
}
