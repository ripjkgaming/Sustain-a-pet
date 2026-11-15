import { expect, test } from '@playwright/test'

// Full production flow against the real server (needs `npm start` with AI_MOCK=1, or a real key, via BASE_URL).
test('first visit -> onboarding -> GreenLens quest -> reward -> reload persistence', async ({ browser }) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })

  await page.goto('/')
  await page.getByRole('button', { name: 'Continue' }).click({ timeout: 15_000 })
  await page.getByLabel('Name your pet').fill('Pip')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Snap with GreenLens')).toBeVisible()
  await page.getByRole('button', { name: /^Hatch/ }).click()

  await page.getByRole('button', { name: 'Skip guide' }).click({ timeout: 20_000 })
  await page.getByRole('button', { name: /Open GreenLens/ }).click()
  const dialog = page.getByRole('dialog')
  // Privacy notice is shown before anything can be submitted.
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Find a quest' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Got it' }).click()

  await dialog.getByLabel('Or describe something').fill('a reusable water bottle')
  await dialog.getByRole('button', { name: 'Find a quest' }).click()
  await dialog.getByRole('button', { name: 'Add to my quests' }).click({ timeout: 30_000 })

  await dialog.getByRole('button', { name: /^I did it:/ }).click()
  await dialog.getByRole('button', { name: 'Yes, I did it' }).click()
  // Server-confirmed completion shows the celebration with the reward.
  await expect(dialog.getByRole('heading', { name: 'Quest complete!' })).toBeVisible({ timeout: 10_000 })
  await dialog.getByRole('button', { name: 'Back to the garden' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const before = await page.evaluate(() => localStorage.getItem('sustain-a-pet'))
  expect(before).toContain('"xp"')
  await page.reload()
  const after = await page.evaluate(() => localStorage.getItem('sustain-a-pet'))
  expect(after).toBe(before)
  await page.getByRole('button', { name: /Open GreenLens/ }).click({ timeout: 20_000 })
  await expect(page.getByRole('dialog').locator('.gl-done-tag')).toBeVisible()

  expect(errors).toEqual([])
  await context.close()
})
