import { useEffect, useState } from 'react'

/** Leaf-sprite mascot, drawn to match the reference splash: lighter face mask, big eyes, little beak. */
export function Mascot({ size = 96, className = '', body = true, shades = false }) {
  return (
    <svg className={`mascot ${className}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="112" rx="34" ry="6" fill="#0000001a" />
      {body && <path d="M26 58c0-24 14-40 34-40s34 16 34 40v30c0 12-10 20-34 20S26 100 26 88z" fill="#58cc02" />}
      <path d="M44 22c-3-9 2-15 10-16-1 8-3 13-10 16zM76 22c3-9-2-15-10-16 1 8 3 13 10 16z" fill="#89e219" />
      <path d="M26 62c0-14 8-26 20-26h28c12 0 20 12 20 26 0 16-9 26-22 26H48c-13 0-22-10-22-26z" fill="#89e219" />
      <ellipse cx="46" cy="62" rx="14" ry="17" fill="#fff" />
      <ellipse cx="74" cy="62" rx="14" ry="17" fill="#fff" />
      <ellipse cx="49" cy="64" rx="7" ry="10" fill="#4b4b4b" />
      <ellipse cx="71" cy="64" rx="7" ry="10" fill="#4b4b4b" />
      <circle cx="51" cy="59" r="2.6" fill="#fff" />
      <circle cx="73" cy="59" r="2.6" fill="#fff" />
      <path d="M52 76c0-5 4-8 8-8s8 3 8 8c0 4-4 7-8 7s-8-3-8-7z" fill="#ff9600" />
      <path d="M53 75c1-4 4-6 7-6s6 2 7 6z" fill="#ffc800" />
      {shades && <path d="M30 56h60l-8 20H38z" fill="#7a2d00" opacity=".9" />}
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
