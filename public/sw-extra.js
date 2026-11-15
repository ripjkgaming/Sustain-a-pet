// Extra service worker logic, loaded by the generated sw.js via importScripts.
// On activate, delete every runtime cache of this app that is not the current version.
// Keep CURRENT in sync with CACHE_VERSION in vite.config.js (tests/serviceWorker.test.js checks it).
const CURRENT = ['sustain-a-pet-pet-models-v1', 'sustain-a-pet-pet-textures-v1']
const OWNED = /^sustain-a-pet-pet-(models|textures)-/

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => OWNED.test(n) && !CURRENT.includes(n)).map((n) => caches.delete(n)),
    )),
  )
})
