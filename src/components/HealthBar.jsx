import { moodFor } from '../engine.js'

export default function HealthBar({ health }) {
  const mood = moodFor(health)
  return (
    <div className="bar-wrap">
      <div className="bar-head"><span>Health</span><span>{health} / 100 · {mood}</span></div>
      <div className={`bar health ${mood.toLowerCase()}`} role="progressbar" aria-label="Health" aria-valuemin={0} aria-valuemax={100} aria-valuenow={health}>
        <div className="fill" style={{ transform: `scaleX(${Math.max(0, Math.min(100, health)) / 100})` }} />
      </div>
    </div>
  )
}
