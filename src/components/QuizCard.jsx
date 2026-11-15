import { useId } from 'react'
import quiz from '../data/quiz.json'
import { daysBetween } from '../engine.js'

/** One question per local day, chosen by day number so it is stable across reloads. */
export const questionFor = (today) => quiz[((daysBetween('2026-01-01', today) % quiz.length) + quiz.length) % quiz.length]

export default function QuizCard({ today, result, onAnswer }) {
  const q = questionFor(today)
  const headingId = useId()
  return (
    <section className="card" aria-labelledby={headingId}>
      <h2 id={headingId}>Daily quiz</h2>
      <p className="q">{q.q}</p>
      <div className="opts" role="group" aria-label="Answers">
        {q.options.map((o, i) => (
          <button key={o} type="button" disabled={!!result} className={result && i === q.answer ? 'right' : ''} onClick={() => onAnswer(i, q.answer)}><kbd className="key" aria-hidden="true">{'ABC'[i]}</kbd>{o}</button>
        ))}
      </div>
      {result && (
        <p className={`why ${result}`} role="status">
          {result === 'correct' ? 'Correct! +10 XP. ' : 'Not quite, and that is fine. '}{q.explain}
        </p>
      )}
    </section>
  )
}
