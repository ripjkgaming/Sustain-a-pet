import { expect, test } from '@playwright/test'
import { DEVELOPER_TEXT, onboard, openLens, openQuests, trackErrors } from './helpers.js'

// Smoke suite part 2 (scenarios 6-9): routing, offline reopen, API failure paths, missing WebGL.
// Runs against the built app served by server/index.js with AI_MOCK=1.

test('6. deep-link reloads return the app, unknown /api/x returns JSON', async ({ page, request }) => {
  const errors = trackErrors(page)
  for (const path of ['/garden', '/quests/today', '/a/b/c']) {
    const res = await page.goto(path)
    expect(res.status(), path).toBe(200)
    expect(res.headers()['content-type'], path).toContain('text/html')
    await expect(page.getByRole('button', { name: 'Continue' }), path).toBeVisible({ timeout: 20_000 })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Continue' }), `${path} after reload`).toBeVisible({ timeout: 20_000 })
  }
  const api = await request.get('/api/x')
  expect(api.status()).toBe(404)
  expect(api.headers()['content-type']).toContain('application/json')
  expect(() => JSON.parse(api.body.toString())).not.toThrow()
  expect((await api.text())).not.toMatch(/<html|<!doctype/i)
  const wrong = await request.get('/api/eco-quest')
  expect(wrong.headers()['content-type']).toContain('application/json')
  expect([404, 405]).toContain(wrong.status())
  const missing = await request.get('/assets/missing-file.js')
  expect(missing.status()).toBe(404)
  expect(errors).toEqual([])
})

test.describe('7. offline reopen', () => {
  test.use({ serviceWorkers: 'allow' })
  test('app reopens offline after one online visit via the service worker', async ({ context, page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 20_000 })
    // Wait for the worker to install, activate and finish precaching.
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg?.active) return false
      const keys = await caches.keys()
      for (const k of keys) if (await (await caches.open(k)).match('/index.html')) return true
      return false
    }, null, { timeout: 60_000 })
    // Reload once so the worker controls the page.
    await page.reload()
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 20_000 })
    // A deep link also opens from the cache.
    await page.goto('/garden')
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 20_000 })
    await context.setOffline(false)
  })
})

test.describe('8. API failure paths', () => {
  const failures = [
    ['500 server error', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"server_error","message":"boom at Object.handler (/srv/api.js:12:3)"}' })],
    ['429 rate limited', (route) => route.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': '30' }, body: '{"error":"rate_limited"}' })],
    ['413 payload too large', (route) => route.fulfill({ status: 413, contentType: 'application/json', body: '{"error":"payload_too_large"}' })],
    ['504 gateway timeout', (route) => route.fulfill({ status: 504, contentType: 'application/json', body: '{"error":"gateway_timeout"}' })],
    ['unreachable (connection fails)', (route) => route.abort('connectionrefused')],
    ['network timeout', (route) => route.abort('timedout')],
    ['invalid JSON in a 200 reply', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"title": "oops", ' })],
    ['HTML instead of JSON', (route) => route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>Bad Gateway</body></html>' })],
  ]
  for (const [label, handler] of failures) {
    test(`${label}: plain recovery message, no developer text, app stays usable`, async ({ page }) => {
      // Failed fetches are logged by the browser as console errors; only uncaught page errors count here.
      const pageErrors = []
      page.on('pageerror', (e) => pageErrors.push(e.message))
      await onboard(page)
      await page.route('**/api/eco-quest', handler)
      const dialog = await openLens(page)
      await dialog.getByLabel('Or describe something').fill('a plastic cup')
      await dialog.getByRole('button', { name: 'Find a quest' }).click()

      // A plain heading and an action to recover appear.
      const heading = dialog.locator('.gl-title')
      await expect(dialog.getByRole('button', { name: /Try again|Start over/ }).first()).toBeVisible({ timeout: 30_000 })
      const text = (await dialog.innerText()).replace(/\s+/g, ' ')
      expect(text, `visible text: ${text}`).not.toMatch(DEVELOPER_TEXT)
      await expect(heading).not.toBeEmpty()

      // Recover: start over, then close, and the rest of the app still works.
      await dialog.getByRole('button', { name: 'Start over' }).click()
      await expect(dialog.getByLabel('Or describe something')).toBeVisible()
      await dialog.getByRole('button', { name: 'Close GreenLens' }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      const quests = await openQuests(page)
      await quests.locator('.quest-row').first().click()
      await quests.getByRole('button', { name: 'I did it' }).click()
      await expect(quests.locator('.quest-sheet')).toBeVisible()
      expect(pageErrors).toEqual([])
    })
  }
})

test('9. missing WebGL renders without crash', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(String(type))) return null
      return original.call(this, type, ...rest)
    }
    // OffscreenCanvas too, when present.
    if (globalThis.OffscreenCanvas) {
      const o = OffscreenCanvas.prototype.getContext
      OffscreenCanvas.prototype.getContext = function (type, ...rest) { return /webgl/i.test(String(type)) ? null : o.call(this, type, ...rest) }
    }
  })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  await onboard(page, 'Moss')
  await expect(page.getByRole('heading', { level: 1, name: 'Moss' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quests', exact: true })).toBeVisible()
  // The app is still playable without 3D.
  const dialog = await openQuests(page)
  await dialog.locator('.quest-row').first().click()
  await dialog.getByRole('button', { name: 'I did it' }).click()
  await expect(dialog.locator('.quest-sheet')).toBeVisible()
  expect(await page.evaluate(() => !!document.querySelector('canvas[data-engine]'))).toBe(false)
  expect(pageErrors).toEqual([])
})
