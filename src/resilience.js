// Browser capability and connectivity checks. Pure helpers plus one React hook; safe outside a browser.
import { useSyncExternalStore } from 'react'

let webglCache = null

/**
 * True when this browser can create a WebGL context. Cached after the first check.
 * `doc` is injectable for tests. Any exception counts as "no WebGL", so callers never throw.
 */
export function hasWebGL(doc = typeof document !== 'undefined' ? document : null, { cache = true } = {}) {
  if (cache && webglCache !== null) return webglCache
  let ok = false
  try {
    const canvas = doc?.createElement?.('canvas')
    const gl = canvas?.getContext?.('webgl2') || canvas?.getContext?.('webgl') || canvas?.getContext?.('experimental-webgl')
    ok = !!gl
    gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.() // free the probe context right away
  } catch {
    ok = false
  }
  if (cache) webglCache = ok
  return ok
}

function subscribeOnline(callback) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

const onlineSnapshot = () => typeof navigator === 'undefined' || navigator.onLine !== false

/** Live online/offline state from the browser's `online` and `offline` events. */
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, onlineSnapshot, () => true)
}
