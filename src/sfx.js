// Synthesized WebAudio sound effects. No audio files.
const KEY = 'sustain-pet-muted'
const MASTER = 0.18

let ctx = null
let master = null
let muted = false
try {
  muted = typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
} catch {
  muted = false
}

function getCtx() {
  if (muted) return null
  try {
    if (!ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = MASTER
      master.connect(ctx.destination)
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      const p = ctx.resume()
      if (p && p.catch) p.catch(() => {})
    }
    return ctx
  } catch {
    return null
  }
}

// Single tone with attack/release ramps (no clicks).
function tone(c, freq, start, dur, type = 'sine', gain = 0.5, slideTo = null) {
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// Filtered noise sweep (whoosh / sparkle).
function noise(c, start, dur, fromHz, toHz, gain = 0.3, q = 1.2, type = 'bandpass') {
  const t0 = c.currentTime + start
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(fromHz, t0)
  f.frequency.exponentialRampToValueAtTime(toHz, t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.35)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(f)
  f.connect(g)
  g.connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

const N = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, B5: 987.77, C6: 1046.5, E6: 1318.5, G6: 1568 }

// Wrap each effect so any failure is swallowed.
const make = (fn) => () => {
  const c = getCtx()
  if (!c) return
  try {
    fn(c)
  } catch {
    /* ignore */
  }
}

export const sfx = {
  tap: make((c) => tone(c, 700, 0, 0.04, 'sine', 0.35, 560)),
  pop: make((c) => tone(c, 380, 0, 0.12, 'sine', 0.6, 900)),
  open: make((c) => noise(c, 0, 0.22, 400, 2200, 0.35)),
  close: make((c) => noise(c, 0, 0.2, 2000, 350, 0.3)),
  select: make((c) => tone(c, 880, 0, 0.05, 'triangle', 0.35)),
  toggle: make((c) => tone(c, 620, 0, 0.05, 'square', 0.15, 760)),
  complete: make((c) => {
    ;[N.C5, N.E5, N.G5].forEach((f, i) => tone(c, f, i * 0.09, 0.22, 'triangle', 0.5))
  }),
  correct: make((c) => {
    tone(c, N.C5, 0, 0.16, 'sine', 0.5)
    tone(c, N.E5, 0.11, 0.26, 'sine', 0.5)
    tone(c, N.C6, 0.16, 0.2, 'triangle', 0.15)
    tone(c, N.E6, 0.2, 0.18, 'sine', 0.1)
  }),
  wrong: make((c) => {
    tone(c, 311, 0, 0.16, 'sine', 0.55, 280)
    tone(c, 233, 0.14, 0.24, 'sine', 0.55, 205)
  }),
  streak: make((c) => {
    ;[N.C5, N.D5, N.E5, N.G5, N.C6].forEach((f, i) => tone(c, f, i * 0.06, 0.18, 'triangle', 0.45))
    tone(c, N.E6, 0.3, 0.3, 'sine', 0.12)
    tone(c, N.G6, 0.33, 0.3, 'sine', 0.08)
  }),
  levelUp: make((c) => {
    ;[N.C5, N.E5, N.G5, N.C6, N.E6].forEach((f, i) => tone(c, f, i * 0.1, 0.3, 'triangle', 0.45))
    tone(c, N.G6, 0.5, 0.5, 'sine', 0.25)
    noise(c, 0.35, 0.6, 4000, 9000, 0.12, 2, 'highpass')
  }),
  claim: make((c) => {
    tone(c, N.B5, 0, 0.09, 'square', 0.12)
    tone(c, N.E6, 0.08, 0.3, 'sine', 0.45)
  }),
  setMuted(v) {
    muted = !!v
    try {
      localStorage.setItem(KEY, muted ? '1' : '0')
    } catch {
      /* ignore */
    }
  },
  isMuted() {
    return muted
  },
}

export default sfx
