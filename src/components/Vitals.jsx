import Icon from './Icons.jsx'
import { nextStage } from '../engine.js'

/**
 * One thick Growth bar, with health and mood as small icon readouts. Mood is a display score mixing
 * health with how many of today's habits are done; the pet's mood band still comes from health alone.
 */
export default function Vitals({ health, xp, doneToday, totalHabits }) {
  const next = nextStage(xp)
  const growth = next ? Math.round(((xp - next.from) / (next.at - next.from)) * 100) : 100
  const mood = Math.min(100, Math.round(health * 0.75 + (doneToday / totalHabits) * 25))
  const title = next ? `${xp} XP · ${next.at - xp} XP to ${next.name}` : `${xp} XP · fully grown`
  return (
    <section className="vitals" aria-label="Pet vitals" title={title}>
      <Icon name="sprout" size={22} className="v-grow" />
      <div className="vbar" role="progressbar" aria-label="Growth" aria-valuemin={0} aria-valuemax={100} aria-valuenow={growth}>
        <div className="vfill" style={{ transform: `scaleX(${Math.max(0, Math.min(100, growth)) / 100})` }} />
      </div>
      <span className="vmini v-heart" aria-label={`Health ${health}`}><Icon name="heart" size={18} />{health}</span>
      <span className="vmini v-mood" aria-label={`Mood ${mood}`}><Icon name="smile" size={18} />{mood}</span>
    </section>
  )
}
