import { expect, test } from '@playwright/test'

// Regression: a first visit with empty storage used to crash on `pet.game` and
// leave a blank screen. It must render onboarding with no page errors.
test('first visit with empty storage renders onboarding', async ({ browser }) => {
  // A new context has empty localStorage and no service worker.
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })

  await page.goto('/')
  expect(await page.evaluate(() => localStorage.getItem('sustain-a-pet'))).toBeNull()

  // Splash shows first, then onboarding with its Continue button.
  const cta = page.getByRole('button', { name: 'Continue' })
  await expect(cta).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('radiogroup', { name: 'Choose your pet' })).toBeVisible()

  expect(errors).toEqual([])
  await context.close()
})
