import { useId, useState } from 'react'
import quiz from '../data/quiz.json'
import { daysBetween } from '../engine.js'
import { Mascot } from './Duo.jsx'

/** One question per local day, chosen by day number so it is stable across reloads. */
export const questionFor = (today) => quiz[((daysBetween('2026-01-01', today) % quiz.length) + quiz.length) % quiz.length]

export default function QuizCard({ today, result, onAnswer }) {
  const q = questionFor(today)
  const headingId = useId()
  const [picked, setPicked] = useState(null)
  const answered = !!result
  const right = result === 'correct'
  return (
    <section className={`card quiz-ex ${answered ? (right ? 'is-right' : 'is-wrong') : ''}`} aria-labelledby={headingId}>
      <span className="quiz-kicker">DAILY QUIZ</span>
      <h2 id={headingId}>Pick the right answer</h2>
      <div className="say say-sm"><Mascot size={72} /><p className="bubble">{q.q}</p></div>
      <div className="opts" role="group" aria-label="Answers">
        {q.options.map((o, i) => (
          <button key={o} type="button" disabled={answered} aria-pressed={picked === i}
            className={`chip ${picked === i && !answered ? 'sel' : ''} ${answered && i === q.answer ? 'right' : ''} ${answered && picked === i && i !== q.answer ? 'wrong' : ''}`}
            onClick={() => setPicked(i)}><kbd className="key" aria-hidden="true">{'ABC'[i]}</kbd>{o}</button>
        ))}
      </div>
      {!answered && <button type="button" className="duo-btn green" disabled={picked === null} onClick={() => onAnswer(picked, q.answer)}>Check</button>}
      {answered && (
        <div className={`feedback ${right ? 'good' : 'bad'}`} role="status">
          <strong><i aria-hidden="true">{right ? '✓' : '✕'}</i>{right ? 'Awesome! +10 XP' : 'Not quite, and that is fine'}</strong>
          <p>{q.explain}</p>
        </div>
      )}
    </section>
  )
}
