import { createContext, useContext, useEffect, useState } from 'react'

const SPRITE_KEY = 'sustain-a-pet'
const SpriteContext = createContext(null)
export const SpriteProvider = SpriteContext.Provider
/** Chosen sprite id: context first, then the saved pet, then leafling. */
export function useSprite() {
  const ctx = useContext(SpriteContext)
  if (ctx) return ctx
  try { return JSON.parse(localStorage.getItem(SPRITE_KEY))?.pet?.sprite || 'leafling' } catch { return 'leafling' }
}

function Face({ y = 68, gap = 13, blush = true, shades = false }) {
  return <g>
    <ellipse cx={60 - gap} cy={y} rx="5" ry="7" fill="#2b2b2b" />
    <ellipse cx={60 + gap} cy={y} rx="5" ry="7" fill="#2b2b2b" />
    <circle cx={60 - gap + 1.8} cy={y - 2.6} r="2" fill="#fff" />
    <circle cx={60 + gap + 1.8} cy={y - 2.6} r="2" fill="#fff" />
    {blush && <><ellipse cx={60 - gap - 9} cy={y + 8} rx="5" ry="3" fill="#ff8fa3" opacity=".7" /><ellipse cx={60 + gap + 9} cy={y + 8} rx="5" ry="3" fill="#ff8fa3" opacity=".7" /></>}
    <path d={`M${54} ${y + 9}q6 6 12 0`} fill="none" stroke="#2b2b2b" strokeWidth="2.6" strokeLinecap="round" />
    {shades && <path d={`M${60 - gap - 14} ${y - 8}h${2 * gap + 28}l-6 18H${60 - gap - 8}z`} fill="#3a2a1a" opacity=".92" />}
  </g>
}

function Leafling({ shades }) {
  return <>
    <ellipse cx="60" cy="72" rx="40" ry="35" fill="#3f9e3a" />
    <ellipse cx="60" cy="82" rx="30" ry="22" fill="#86d35f" />
    <path d="M60 40c0-8 1-14 3-18" stroke="#2f7d32" strokeWidth="4" strokeLinecap="round" fill="none" />
    <path d="M63 24c10-10 24-8 28-4-2 12-14 18-28 4z" fill="#2f7d32" />
    <path d="M63 24c8-2 16-1 24-1" stroke="#7bd05a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M58 34c-9-8-22-7-26-3 2 11 14 17 26 3z" fill="#4caf3a" />
    <Face shades={shades} />
  </>
}

function Mossy({ shades }) {
  return <>
    <ellipse cx="60" cy="74" rx="42" ry="33" fill="#6c8f3c" />
    {[[30,70],[44,92],[78,90],[92,72],[56,98],[72,56],[36,58]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill="#8fb54e" />)}
    <path d="M26 44a22 18 0 0144 0z" fill="#d9573b" />
    <circle cx="38" cy="38" r="3.4" fill="#fff" /><circle cx="52" cy="34" r="2.6" fill="#fff" /><circle cx="60" cy="42" r="2.2" fill="#fff" />
    <rect x="42" y="44" width="8" height="8" rx="3" fill="#f4e6cf" />
    <path d="M70 44a15 12 0 0130 0z" fill="#e8825f" />
    <circle cx="80" cy="38" r="2.4" fill="#fff" /><circle cx="91" cy="40" r="1.8" fill="#fff" />
    <rect x="80" y="44" width="6" height="7" rx="2.5" fill="#f4e6cf" />
    <Face y={74} shades={shades} />
  </>
}

function Sunbud({ shades }) {
  return <>
    {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="60" cy="22" rx="9" ry="17" fill={i % 2 ? '#ffb703' : '#ff9f1c'} transform={`rotate(${i * 30} 60 62)`} />)}
    <circle cx="60" cy="62" r="29" fill="#d96a1c" />
    <circle cx="60" cy="62" r="25" fill="#f08a24" />
    <Face y={62} gap={10} shades={shades} />
  </>
}

const ART = { leafling: Leafling, mossy: Mossy, sunbud: Sunbud }

/** Mascot for the sprite the player picked. `body={false}` adds a white plate so it reads on a green screen. */
export function Mascot({ size = 96, className = '', body = true, shades = false, sprite }) {
  const chosen = useSprite()
  const Art = ART[sprite || chosen] || Leafling
  return (
    <svg className={`mascot ${className}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="112" rx="34" ry="6" fill="#0000001a" />
      {!body && <circle cx="60" cy="62" r="56" fill="#fff" />}
      <Art shades={shades} />
    </svg>
  )
}

/** Mascot on the left, speech bubble on the right. */
export function Say({ children, size = 104 }) {
  return (
    <div className="say">
      <Mascot size={size} />
      <p className="bubble">{children}</p>
    </div>
  )
}

/** Back/close glyph + chunky progress bar used at the top of every flow screen. */
export function FlowBar({ value, onBack, close = false, right }) {
  return (
    <div className="flowbar">
      <button type="button" className="flow-icon" aria-label={close ? 'Close' : 'Back'} onClick={onBack} disabled={!onBack}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={close ? 'M5 5l14 14M19 5L5 19' : 'M19 12H5m6-6-6 6 6 6'} />
        </svg>
      </button>
      <div className="duo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        <div className="duo-bar-fill" style={{ transform: `scaleX(${Math.max(0.06, Math.min(1, value))})` }} />
      </div>
      {right}
    </div>
  )
}

export function StatTile({ tone, label, children }) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      <span>{label}</span>
      <b>{children}</b>
    </div>
  )
}

export function Splash({ onDone, ms = 1300 }) {
  useEffect(() => {
    const t = setTimeout(onDone, ms)
    return () => clearTimeout(t)
  }, [onDone, ms])
  return (
    <div className="splash" role="img" aria-label="Sustain-a-Pet">
      <Mascot size={150} body={false} className="splash-mascot" />
      <span className="splash-word">sustain-a-pet</span>
    </div>
  )
}

export function useSplash(ms = 1300) {
  const [shown, setShown] = useState(true)
  return [shown, () => setShown(false), ms]
}

/** Orange "N day streak" screen with the week row. */
export function StreakScreen({ streak, onShare, onContinue }) {
  const today = (new Date().getDay() + 6) % 7 // Mon = 0
  const done = Math.min(streak, 7)
  return (
    <div className="streak-screen" role="dialog" aria-modal="true" aria-label={`${streak} day streak`}>
      <div className="streak-flame"><Mascot size={170} shades body className="streak-mascot" /></div>
      <b className="streak-num">{streak}</b>
      <h2>day streak</h2>
      <div className="week-row">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => {
          const hit = i <= today && i > today - done
          return <div key={d} className={`week-day ${i === today ? 'now' : ''}`}><span>{d}</span><i className={hit ? 'hit' : ''}>{hit && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</i></div>
        })}
      </div>
      <div className="streak-actions">
        <button type="button" className="duo-btn white" onClick={onShare}>Share my streak</button>
        <button type="button" className="duo-link" onClick={onContinue}>Continue</button>
      </div>
    </div>
  )
}

/** Bottom sheet: preview card + share targets. */
export function ShareSheet({ title, headline, stats, text, onClose }) {
  const [note, setNote] = useState('')
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title, text }); return }
      await navigator.clipboard.writeText(text); setNote('Copied to clipboard')
    } catch { setNote('Sharing is not available here') }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(text); setNote('Copied to clipboard') } catch { setNote('Copy is not available here') } }
  return (
    <div className="share-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="share-card-wrap" onClick={(e) => e.stopPropagation()}>
        <section className="share-card">
          <header><span className="share-logo">sustain-a-pet</span><small>{title}</small></header>
          <Mascot size={110} body className="share-mascot" />
          <h3>{headline}</h3>
          <div className="share-grid">{stats.map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}</div>
        </section>
        <div className="share-sheet">
          <div className="share-head"><button type="button" className="flow-icon" aria-label="Close" onClick={onClose}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button><b>SHARE {title.toUpperCase()}</b></div>
          <div className="share-targets">
            <button type="button" onClick={share}><i className="t-green" /><span>Share</span></button>
            <button type="button" onClick={copy}><i><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" /></svg></i><span>Copy text</span></button>
            <button type="button" onClick={share}><i><b>•••</b></i><span>More</span></button>
          </div>
          <p className="share-note" role="status">{note}</p>
        </div>
      </div>
    </div>
  )
}
