// Service worker registration and the "update available" notice. Production builds only.
// A new worker installs in the background and waits; the page keeps running its current
// assets until the user taps Reload (then the worker takes over and the page reloads).
import { useEffect, useState } from 'react'

/** Register the service worker. Returns a subscribe fn for update events, or null when SW is off. */
export function registerServiceWorker(env = import.meta.env, nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!env.PROD || !nav || !('serviceWorker' in nav)) return null
  const listeners = new Set()
  let apply = () => {}
  let needed = false
  import('virtual:pwa-register').then(({ registerSW }) => {
    apply = registerSW({
      immediate: true,
      onNeedRefresh() { needed = true; listeners.forEach((fn) => fn(true)) },
      onRegisterError() {}, // registration failure leaves the app fully usable online
    })
  }).catch(() => {})
  return {
    subscribe(fn) { listeners.add(fn); if (needed) fn(true); return () => listeners.delete(fn) },
    update: () => apply(true),
  }
}

export function UpdateNotice({ sw }) {
  const [ready, setReady] = useState(false)
  useEffect(() => sw?.subscribe(setReady), [sw])
  if (!ready) return null
  return (
    <div className="banner sw-update" role="status">
      <span>A new version is ready.</span>
      <button type="button" onClick={() => sw.update()}>Reload</button>
      <button type="button" aria-label="Dismiss" onClick={() => setReady(false)}>×</button>
    </div>
  )
}
