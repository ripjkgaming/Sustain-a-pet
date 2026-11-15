import { expect, test } from '@playwright/test'
import { PNG_1X1, STORAGE_KEY, expectNoHorizontalOverflow, onboard, openLens, openQuests, trackErrors } from './helpers.js'

// Smoke suite part 1 (scenarios 1-5). Runs against the built app served by server/index.js with AI_MOCK=1.
// Tests tagged @layout also run in the EMULATED-* phone projects (Chromium with a phone viewport, not real devices).

// Scenarios 2-5 exercise game logic, not rendering. Software WebGL is very slow on a CI runner, so these run on
// the app's built-in no-WebGL fallback (SceneBoundary). Scenario 1 keeps the real 3D scene.
async function disableWebGL(page) {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (/webgl/i.test(String(type))) return null
      return orig.call(this, type, ...rest)
    }
  })
}

test('1. fresh onboarding with empty storage, no page errors @layout', async ({ page }, testInfo) => {
  const errors = trackErrors(page)
  await page.goto('/')
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('radiogroup', { name: 'Choose your pet' })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'onboarding')
  await page.screenshot({ path: testInfo.outputPath('onboarding.png') })

  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Name your pet').fill('Pip')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: /^Hatch/ }).click()
  await page.getByRole('button', { name: 'Skip guide' }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1, name: 'Pip' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quests', exact: true })).toBeVisible()
  await expectNoHorizontalOverflow(page, 'home')
  await page.screenshot({ path: testInfo.outputPath('home.png') })
  expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toContain('"Pip"')
  expect(errors).toEqual([])
})

test('2. habit completion and daily quiz @layout', async ({ page }, testInfo) => {
  const errors = trackErrors(page)
  await disableWebGL(page)
  await onboard(page)

  // Habit.
  let dialog = await openQuests(page)
  await expect(dialog.locator('.quest-count')).toHaveText(/^0\//)
  await expectNoHorizontalOverflow(page, 'quest list')
  await page.screenshot({ path: testInfo.outputPath('quest-list.png') })
  await dialog.locator('.quest-row').first().click()
  await dialog.getByRole('button', { name: 'I did it' }).click()
  await expect(dialog.locator('.quest-sheet')).toContainText('Awesome! +')
  // Continue closes the quest dialog. Reopen it: the habit must be counted as done.
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  dialog = await openQuests(page)
  await expect(dialog.locator('.quest-count')).toHaveText(/^1\//)
  await expect(dialog.locator('.quest-row.is-done')).toHaveCount(1)

  // Quiz: pick the first option, check, get feedback either way.
  await dialog.locator('.quest-row.is-gold').click()
  await dialog.locator('.quest-opt').first().click()
  await dialog.getByRole('button', { name: 'Check' }).click()
  await expect(dialog.locator('.quest-sheet')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('quiz-feedback.png') })
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  dialog = await openQuests(page)
  await expect(dialog.locator('.quest-count')).toHaveText(/^2\//)
  await expect(dialog.locator('.quest-row.is-gold.is-done')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('3. photo AI quest generation then completion @layout', async ({ page }, testInfo) => {
  const errors = trackErrors(page)
  await disableWebGL(page)
  await onboard(page)
  const dialog = await openLens(page)
  await expectNoHorizontalOverflow(page, 'greenlens capture')
  await page.screenshot({ path: testInfo.outputPath('greenlens-capture.png') })

  await dialog.locator('input[type=file]').last().setInputFiles({ name: 'bottle.png', mimeType: 'image/png', buffer: PNG_1X1 })
  await dialog.getByRole('button', { name: 'Add to my quests' }).click({ timeout: 30_000 })
  await expectNoHorizontalOverflow(page, 'greenlens quest')
  await page.screenshot({ path: testInfo.outputPath('greenlens-quest.png') })
  await dialog.getByRole('button', { name: /^I did it:/ }).click()
  await dialog.getByRole('button', { name: 'Yes, I did it' }).click()
  await expect(dialog.getByRole('heading', { name: 'Quest complete!' })).toBeVisible({ timeout: 15_000 })
  expect(errors).toEqual([])
})

test('4. text AI quest generation then completion', async ({ page }) => {
  const errors = trackErrors(page)
  await disableWebGL(page)
  await onboard(page)
  const dialog = await openLens(page)
  await dialog.getByLabel('Or describe something').fill('a plastic bag from the shop')
  await dialog.getByRole('button', { name: 'Find a quest' }).click()
  await dialog.getByRole('button', { name: 'Add to my quests' }).click({ timeout: 30_000 })
  await dialog.getByRole('button', { name: /^I did it:/ }).click()
  await dialog.getByRole('button', { name: 'Yes, I did it' }).click()
  await expect(dialog.getByRole('heading', { name: 'Quest complete!' })).toBeVisible({ timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Back to the garden' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('5. rewards persist after page reload', async ({ page }) => {
  const errors = trackErrors(page)
  await disableWebGL(page)
  await onboard(page, 'Fern')
  const dialog = await openLens(page)
  await dialog.getByLabel('Or describe something').fill('a reusable water bottle')
  await dialog.getByRole('button', { name: 'Find a quest' }).click()
  await dialog.getByRole('button', { name: 'Add to my quests' }).click({ timeout: 30_000 })
  await dialog.getByRole('button', { name: /^I did it:/ }).click()
  await dialog.getByRole('button', { name: 'Yes, I did it' }).click()
  await expect(dialog.getByRole('heading', { name: 'Quest complete!' })).toBeVisible({ timeout: 15_000 })
  await dialog.getByRole('button', { name: 'Back to the garden' }).click()

  const read = () => page.evaluate((k) => ({ keys: Object.keys(localStorage).sort(), game: JSON.parse(localStorage.getItem(k)) }), STORAGE_KEY)
  const before = await read()
  expect(before.keys).toEqual(expect.arrayContaining([STORAGE_KEY, 'sustain-a-pet-client']))
  expect(before.game.xp).toBeGreaterThan(0)
  expect(before.game.pet.name).toBe('Fern')
  expect(before.game.game.aiQuests.some((q) => q.status === 'done')).toBe(true)
  const coinsText = await page.getByLabel(/\d+ coins/).getAttribute('aria-label')

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Fern' })).toBeVisible({ timeout: 30_000 })
  const after = await read()
  expect(after.game).toEqual(before.game)
  await expect(page.getByLabel(/\d+ coins/)).toHaveAttribute('aria-label', coinsText)
  await page.getByRole('button', { name: /Open GreenLens/ }).click()
  await expect(page.getByRole('dialog').locator('.gl-done-tag')).toBeVisible()
  expect(errors).toEqual([])
})

