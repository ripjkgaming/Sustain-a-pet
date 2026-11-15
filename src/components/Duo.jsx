import { createContext, useContext, useEffect, useId, useState } from 'react'
import { sfx } from '../sfx.js'

const SPRITE_KEY = 'sustain-a-pet'
const SpriteContext = createContext(null)
export const SpriteProvider = SpriteContext.Provider
/** Chosen sprite id: context first, then the saved pet, then leafling. */
export function useSprite() {
  const ctx = useContext(SpriteContext)
  if (ctx) return ctx
  try { return JSON.parse(localStorage.getItem(SPRITE_KEY))?.pet?.sprite || 'leafling' } catch { return 'leafling' }
}

const INK = '#1d3b1f'

function Face({ y = 68, gap = 13, size = 1, shades = false, ink = INK }) {
  const rx = 6 * size, ry = 8 * size
  const eye = (cx) => <g key={cx}>
    <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill="#1b1b24" />
    <ellipse cx={cx} cy={y + ry * 0.45} rx={rx * 0.7} ry={ry * 0.45} fill="#4b5a8a" opacity=".55" />
    <circle cx={cx + rx * 0.3} cy={y - ry * 0.4} r={rx * 0.42} fill="#fff" />
    <circle cx={cx - rx * 0.35} cy={y + ry * 0.35} r={rx * 0.2} fill="#fff" opacity=".9" />
  </g>
  return <g>
    {eye(60 - gap)}{eye(60 + gap)}
    <path d={`M${60 - gap - 7} ${y - ry - 4}q7 -4 14 0M${60 + gap - 7} ${y - ry - 4}q7 -4 14 0`} fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" opacity=".75" />
    <ellipse cx={60 - gap - 10} cy={y + 9} rx="5.5" ry="3.4" fill="#ff7a93" opacity=".6" />
    <ellipse cx={60 + gap + 10} cy={y + 9} rx="5.5" ry="3.4" fill="#ff7a93" opacity=".6" />
    <path d={`M${53} ${y + 8}q7 9 14 0z`} fill="#7a1f2e" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    <path d={`M${56.5} ${y + 12.5}q3.5 3 7 0q-3.5 -2 -7 0z`} fill="#ff6f8a" />
    {shades && <path d={`M${60 - gap - 15} ${y - 9}h${2 * gap + 30}l-6 20H${60 - gap - 9}z`} fill="#2b1d12" opacity=".94" />}
  </g>
}

function Defs({ id, stops }) {
  return <defs>
    {stops.map(([name, c0, c1, c2]) => <radialGradient key={name} id={`${id}-${name}`} cx="35%" cy="28%" r="80%">
      <stop offset="0" stopColor={c0} /><stop offset=".55" stopColor={c1} /><stop offset="1" stopColor={c2} />
    </radialGradient>)}
  </defs>
}

function Leafling({ shades, id }) {
  return <>
    <Defs id={id} stops={[['body', '#9bec6a', '#4fb83e', '#2a7d33'], ['belly', '#e6ffc2', '#b4eb86', '#86d05f'], ['leaf', '#8be25a', '#3fa63a', '#23702c']]} />
    <ellipse cx="38" cy="107" rx="11" ry="6.5" fill="#2f8a35" stroke={INK} strokeWidth="2.4" />
    <ellipse cx="82" cy="107" rx="11" ry="6.5" fill="#2f8a35" stroke={INK} strokeWidth="2.4" />
    <path d="M22 76c-12-2-16 8-10 14 6-1 12-6 14-10z" fill={`url(#${id}-leaf)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M98 76c12-2 16 8 10 14-6-1-12-6-14-10z" fill={`url(#${id}-leaf)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M60 36c-26 0-42 18-42 40 0 20 16 32 42 32s42-12 42-32c0-22-16-40-42-40z" fill={`url(#${id}-body)`} stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
    <ellipse cx="60" cy="88" rx="29" ry="19" fill={`url(#${id}-belly)`} opacity=".9" />
    <path d="M30 56c6-10 16-15 26-16" fill="none" stroke="#e8ffc9" strokeWidth="3.4" strokeLinecap="round" opacity=".7" />
    {[[30, 82], [90, 80], [38, 98], [84, 98]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#2a7d33" opacity=".5" />)}
    <path d="M60 38c0-7 0-11 2-15" stroke={INK} strokeWidth="5.4" strokeLinecap="round" fill="none" />
    <path d="M60 38c0-7 0-11 2-15" stroke="#3fa63a" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    <path d="M62 25c2-12 16-20 30-16 2 14-10 26-30 16z" fill={`url(#${id}-leaf)`} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M64 24c8-4 16-7 24-11" stroke="#d9ffb0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M60 30c-4-12-16-18-30-14-1 14 10 24 30 14z" fill={`url(#${id}-leaf)`} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
    <path d="M57 29c-8-3-16-7-23-11" stroke="#d9ffb0" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    <path d="M62 22c1-8 0-14-3-19 6 2 11 8 9 18z" fill="#58c643" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    <Face y={72} shades={shades} />
  </>
}

function Mossy({ shades, id }) {
  const bumps = 'M60 40c8-5 18-2 24 4 9 0 16 7 17 16 7 6 9 16 5 24 0 12-10 22-24 24-12 5-26 5-38 0-14-2-24-12-24-24-4-8-2-18 5-24 1-9 8-16 17-16 6-6 16-9 18-4z'
  return <>
    <Defs id={id} stops={[['moss', '#b6d86a', '#6f9a3c', '#41692b'], ['cap', '#ff8a63', '#e0472f', '#a52a22'], ['cap2', '#ffc29a', '#f08a55', '#c4552e'], ['stem', '#fffaf0', '#f0e0c4', '#c9b08a']]} />
    <ellipse cx="40" cy="108" rx="11" ry="6" fill="#4f7a2e" stroke={INK} strokeWidth="2.4" />
    <ellipse cx="80" cy="108" rx="11" ry="6" fill="#4f7a2e" stroke={INK} strokeWidth="2.4" />
    <path d={bumps} fill={`url(#${id}-moss)`} stroke={INK} strokeWidth="2.8" strokeLinejoin="round" />
    {[[28, 78, 5], [44, 96, 6], [78, 98, 5], [94, 80, 6], [60, 104, 4], [96, 62, 4], [24, 62, 4], [70, 90, 3]].map(([x, y, r]) => <g key={`${x}${y}`}><circle cx={x} cy={y} r={r} fill="#a9d05a" opacity=".85" /><circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.4} fill="#e2f5a8" opacity=".8" /></g>)}
    <path d="M20 62c3-8 9-13 17-15" fill="none" stroke="#e5f7b0" strokeWidth="3" strokeLinecap="round" opacity=".6" />
    <rect x="34" y="42" width="11" height="12" rx="4" fill={`url(#${id}-stem)`} stroke={INK} strokeWidth="2.2" />
    <path d="M17 44c0-15 11-24 24-24s24 9 24 24c0 3-3 4-6 3-6-2-12-2-18-2s-12 0-18 2c-3 1-6 0-6-3z" fill={`url(#${id}-cap)`} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
    <circle cx="30" cy="34" r="4" fill="#fff4e6" /><circle cx="46" cy="28" r="3" fill="#fff4e6" /><circle cx="52" cy="40" r="2.6" fill="#fff4e6" /><circle cx="24" cy="44" r="2.2" fill="#fff4e6" />
    <path d="M24 30c4-6 10-9 16-9" fill="none" stroke="#ffd9c2" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
    <rect x="78" y="46" width="8" height="9" rx="3" fill={`url(#${id}-stem)`} stroke={INK} strokeWidth="2" />
    <path d="M68 48c0-10 8-17 17-17s17 7 17 17c0 2-2 3-4 2-4-1-8-1-13-1s-9 0-13 1c-2 1-4 0-4-2z" fill={`url(#${id}-cap2)`} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
    <circle cx="80" cy="41" r="2.8" fill="#fff4e6" /><circle cx="93" cy="43" r="2.2" fill="#fff4e6" />
    <path d="M58 44c0-6 2-9 6-11 0 5-2 9-6 11z" fill="#58c643" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    <Face y={76} shades={shades} />
  </>
}

function Sunbud({ shades, id }) {
  const ring = (n, r, rx, ry, cy, c, off = 0) => Array.from({ length: n }, (_, i) => <path key={`${r}${i}`} d={`M60 ${cy - r + ry}c-${rx} -${ry * 0.2} -${rx} -${ry * 1.7} 0 -${ry * 1.9}c${rx} ${ry * 0.2} ${rx} ${ry * 1.7} 0 ${ry * 1.9}z`} fill={c} stroke={INK} strokeWidth="2" strokeLinejoin="round" transform={`rotate(${off + (i * 360) / n} 60 ${cy})`} />)
  return <>
    <Defs id={id} stops={[['face', '#ffc36b', '#f08a24', '#b34e12'], ['pet', '#fff08a', '#ffc21f', '#f08c00'], ['pet2', '#ffd66b', '#ff9f1c', '#d96a00'], ['leaf', '#8be25a', '#3fa63a', '#23702c']]} />
    <g transform="translate(60 62) scale(.84) translate(-60 -60)">
    <ellipse cx="42" cy="108" rx="10" ry="6" fill="#3fa63a" stroke={INK} strokeWidth="2.4" />
    <ellipse cx="78" cy="108" rx="10" ry="6" fill="#3fa63a" stroke={INK} strokeWidth="2.4" />
    <path d="M16 90c-10-4-12 8-4 12 6 0 10-5 10-9z" fill={`url(#${id}-leaf)`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    <path d="M104 90c10-4 12 8 4 12-6 0-10-5-10-9z" fill={`url(#${id}-leaf)`} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
    {ring(14, 52, 8, 20, 58, `url(#${id}-pet2)`, 12)}
    {ring(14, 48, 8.5, 20, 58, `url(#${id}-pet)`, 0)}
    <circle cx="60" cy="58" r="33" fill={`url(#${id}-face)`} stroke={INK} strokeWidth="2.8" />
    {Array.from({ length: 22 }, (_, i) => { const t = (i / 22) * Math.PI * 2; return <circle key={i} cx={60 + Math.cos(t) * 28.5} cy={58 + Math.sin(t) * 28.5} r="1.7" fill="#7a3a0c" opacity=".55" /> })}
    <path d="M36 44c4-9 12-14 22-15" fill="none" stroke="#ffe9b8" strokeWidth="3.2" strokeLinecap="round" opacity=".75" />
    <Face y={58} gap={11} size={0.95} shades={shades} ink="#5a2a08" />
    </g>
  </>
}

const ART = { leafling: Leafling, mossy: Mossy, sunbud: Sunbud }

/** Mascot for the sprite the player picked. `body={false}` adds a white plate so it reads on a green screen. */
export function Mascot({ size = 96, className = '', body = true, shades = false, sprite }) {
  const chosen = useSprite()
  const Art = ART[sprite || chosen] || Leafling
  const id = useId().replace(/:/g, '')
  return (
    <svg className={`mascot ${className}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="112" rx="34" ry="6" fill="#0000001a" />
      {!body && <circle cx="60" cy="62" r="56" fill="#fff" />}
      <Art shades={shades} id={id} />
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
  useEffect(() => { sfx.streak() }, [])
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
        <button type="button" className="duo-btn white" onClick={() => { sfx.tap(); onShare?.() }}>Share</button>
        <button type="button" className="duo-link" onClick={() => { sfx.tap(); onContinue?.() }}>Continue</button>
      </div>
    </div>
  )
}

/** Bottom sheet: preview card + share targets. */
export function ShareSheet({ title, headline, stats, text, onClose }) {
  const [note, setNote] = useState('')
  useEffect(() => { sfx.open() }, [])
  const close = () => { sfx.close(); onClose?.() }
  const share = async () => {
    try {
      if (navigator.share) { await navigator.share({ title, text }); return }
      await navigator.clipboard.writeText(text); setNote('Copied to clipboard')
    } catch { setNote('Sharing is not available here') }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(text); setNote('Copied to clipboard') } catch { setNote('Copy is not available here') } }
  return (
    <div className="share-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={close}>
      <div className="share-card-wrap" onClick={(e) => e.stopPropagation()}>
        <section className="share-card">
          <header><span className="share-logo">sustain-a-pet</span><small>{title}</small></header>
          <Mascot size={110} body className="share-mascot" />
          <h3>{headline}</h3>
          <div className="share-grid">{stats.map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}</div>
        </section>
        <div className="share-sheet">
          <div className="share-head"><button type="button" className="flow-icon" aria-label="Close" onClick={close}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg></button><b>SHARE {title.toUpperCase()}</b></div>
          <div className="share-targets">
            <button type="button" onClick={() => { sfx.tap(); share() }}><i className="t-green"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4m-4 4 4-4 4 4M5 13v6h14v-6" /></svg></i><span>Share</span></button>
            <button type="button" onClick={copy}><i><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" /></svg></i><span>Copy text</span></button>
            <button type="button" onClick={share}><i><b>•••</b></i><span>More</span></button>
          </div>
          <p className="share-note" role="status">{note}</p>
        </div>
      </div>
    </div>
  )
}

const TILE_ICON = {
  gold: <path d="M13 2 5 13h6l-1 9 8-12h-6l1-8z" fill="currentColor" stroke="none" />,
  green: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
  blue: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
}

/** Flawless-style result: big mascot, gold headline, three outlined stat tiles, one CTA. */
export function ResultScreen({ title, subtitle, tiles = [], cta = 'Claim XP', onClaim, mascotSize = 190 }) {
  useEffect(() => { sfx.levelUp() }, [])
  return (
    <div className="result-screen" role="dialog" aria-modal="true" aria-label={title}>
      <div className="result-hero">
        <span className="sparkle s1" /><span className="sparkle s2" /><span className="sparkle s3" />
        <Mascot size={mascotSize} className="complete-mascot" />
      </div>
      <h2 className="result-title">{title}</h2>
      {subtitle && <p className="result-sub">{subtitle}</p>}
      <div className="stat-row">
        {tiles.map(({ tone, label, value }) => (
          <div key={label} className={`stat-tile tone-${tone}`}>
            <span>{label}</span>
            <b>{TILE_ICON[tone] && <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TILE_ICON[tone]}</svg>}{value}</b>
          </div>
        ))}
      </div>
      <button type="button" className="duo-btn blue" autoFocus onClick={() => { sfx.claim(); onClaim?.() }}>{cta}</button>
    </div>
  )
}

/** Green/red bottom sheet shown after an answer. */
export function FeedbackSheet({ kind = 'good', title, body, onContinue }) {
  const good = kind === 'good'
  useEffect(() => { (good ? sfx.correct : sfx.wrong)() }, [good])
  return (
    <div className={`fb-sheet ${good ? 'good' : 'bad'}`} role="status">
      <div className="fb-head">
        <i aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d={good ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6 6l12 12M18 6 6 18'} /></svg></i>
        <b>{title}</b>
      </div>
      {body && <p>{body}</p>}
      <button type="button" className={`duo-btn ${good ? 'green' : 'red'}`} autoFocus onClick={() => { sfx.tap(); onContinue?.() }}>Continue</button>
    </div>
  )
}

/** Chunky orange outlined text pop. */
export function PerfectBanner({ text = 'Perfect' }) {
  return <div className="perfect-banner" role="status" aria-live="polite"><span>{text}</span></div>
}
