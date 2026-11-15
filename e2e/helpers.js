import { expect } from '@playwright/test'

export const STORAGE_KEY = 'sustain-a-pet'

// A real 1x1 PNG. The client re-encodes it to JPEG before upload.
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Collect uncaught page errors and console errors so a test can assert there were none. */
export function trackErrors(page, { ignore = [] } = {}) {
  const errors = []
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (ignore.some((re) => re.test(text))) return
    errors.push(`console.error: ${text}`)
  })
  return errors
}

/** Fresh visit through onboarding to the garden home, guide skipped. */
export async function onboard(page, name = 'Pip') {
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 20_000 })
  await page.getByLabel('Name your pet').fill(name)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /^Hatch/ }).click()
  await page.getByRole('button', { name: 'Skip guide' }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

export async function openQuests(page) {
  await page.getByRole('button', { name: 'Quests', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Quests' })).toBeVisible()
  return dialog
}

/** Open GreenLens and accept the privacy notice. */
export async function openLens(page) {
  await page.getByRole('button', { name: /Open GreenLens/ }).click()
  const dialog = page.getByRole('dialog')
  const gotIt = dialog.getByRole('button', { name: 'Got it' })
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click()
  await expect(dialog.getByLabel('Or describe something')).toBeVisible()
  return dialog
}

/** Developer-facing text that must never reach a customer. */
export const DEVELOPER_TEXT = /undefined|\bnull\b|NaN|\[object|TypeError|SyntaxError|ReferenceError|Unexpected token|JSON\.parse|is not valid JSON|ECONN|ENOTFOUND|stack|at\s+\S+\s+\(|node_modules|Failed to fetch|NetworkError|AbortError|<html|<!doctype|\bHTTP\s*\d{3}\b|\b[45]\d\d\b/i

/** No horizontal overflow: the page must not scroll sideways. */
export async function expectNoHorizontalOverflow(page, label) {
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    view: document.documentElement.clientWidth,
  }))
  expect(Math.max(m.doc, m.body), `${label}: scrollWidth ${m.doc}/${m.body} exceeds viewport ${m.view}`).toBeLessThanOrEqual(m.view)
}
