/** Real-app capture for the GreenLens demo film (2:40 cut).
 * Records the running app with CDP screencast (high quality JPEG frames, real timestamps),
 * one clip per segment, plus a tap log so the film can draw touch indicators at the real tap points.
 *
 * Needs two preview servers built from the same dist:
 *   GOOD_URL (default http://localhost:5180)  real OPENROUTER key -> live AI
 *   BAD_URL  (default http://localhost:5181)  OPENROUTER_API_KEY=sk-or-invalid-demo-key -> provider fails -> labelled prerecorded tip
 * Run: node scripts/capture_greenlens.mjs   (then python3 scripts/encode_captures.py)
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/home/ripjk/sustain-a-pet/node_modules/playwright/index.mjs')
const GOOD = process.env.GOOD_URL || 'http://localhost:5180'
const BAD = process.env.BAD_URL || 'http://localhost:5181'
const LIVE = process.env.LIVE_URL || 'https://sustain-a-pet.deployxa.online'
const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'captures', 'gl-' + new Date().toISOString().replaceAll(':', '-'))
await fs.mkdir(out, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/home/ripjk/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome',
  args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const log = { segments: [], errors: [] }
const save = () => fs.writeFile(path.join(out, 'capture.json'), JSON.stringify(log, null, 2))

async function makePage({ width = 440, height = 956, dpr = 2, mobile = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block', timezoneId: 'Asia/Singapore', locale: 'en-US' })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => log.errors.push(e.message))
  const cdp = await context.newCDPSession(page)
  let seg = null
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    if (!seg) return
    const s = seg
    const name = String(s.frames.length).padStart(5, '0') + '.jpg'
    s.frames.push({ name, ts: metadata.timestamp })
    await fs.writeFile(path.join(s.dir, name), Buffer.from(data, 'base64'))
  })
  const api = {
    page, context, width, height,
    async start(id, note) {
      const dir = path.join(out, id)
      await fs.mkdir(dir, { recursive: true })
      seg = { id, note, dir, frames: [], taps: [], marks: [], t0: Date.now() / 1000, viewport: [width, height], dpr }
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: width * dpr, maxHeight: height * dpr, everyNthFrame: 1 })
      await page.waitForTimeout(400)
    },
    async stop() {
      await page.waitForTimeout(300)
      await cdp.send('Page.stopScreencast')
      await page.waitForTimeout(300)
      const s = seg; seg = null
      const { dir, frames, ...rest } = s
      await fs.writeFile(path.join(dir, 'frames.json'), JSON.stringify(frames))
      log.segments.push({ ...rest, frames: frames.length, firstTs: frames[0]?.ts, lastTs: frames.at(-1)?.ts })
      await save()
      console.log(`${s.id}: ${frames.length} frames, ${(frames.at(-1)?.ts - frames[0]?.ts).toFixed(1)} s`)
    },
    mark(name, extra = {}) { if (seg) seg.marks.push({ name, t: Date.now() / 1000, ...extra }) },
    async tap(locator, opts = {}) {
      await locator.scrollIntoViewIfNeeded().catch(() => {})
      const box = await locator.boundingBox()
      if (box && seg) seg.taps.push({ t: Date.now() / 1000, x: box.x + box.width / 2, y: box.y + box.height / 2 })
      await locator.click(opts)
    },
    async tapAt(x, y) { if (seg) seg.taps.push({ t: Date.now() / 1000, x, y }); await page.mouse.click(x, y) },
    hold: (ms) => page.waitForTimeout(ms),
  }
  return api
}

async function onboard(a, url, { record = false, slow = false, navigate = true } = {}) {
  const { page } = a
  if (navigate) await page.goto(url + '/')
  await page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 30000 })
  if (record) await a.start('onboarding', 'fresh browser context: onboarding to garden, no account')
  await a.hold(slow ? 1800 : 300)
  await a.tap(page.getByRole('button', { name: 'Continue' }))
  await a.hold(slow ? 900 : 200)
  const name = page.getByLabel('Name your pet')
  await a.tap(name)
  if (slow) await name.pressSequentially('Pip', { delay: 140 }); else await name.fill('Pip')
  await a.hold(slow ? 700 : 100)
  await a.tap(page.getByRole('button', { name: 'Continue' }))
  await a.hold(slow ? 2200 : 200)
  await a.tap(page.getByRole('button', { name: /^Hatch/ }))
  await page.getByRole('button', { name: 'Skip guide' }).waitFor({ timeout: 30000 })
  await a.hold(slow ? 1800 : 500)
  await a.tap(page.getByRole('button', { name: 'Skip guide' }))
  await a.hold(slow ? 3500 : 2500)
  if (record) await a.stop()
}

const lensButton = (page) => page.getByRole('button', { name: /^Open GreenLens/ })
const dialog = (page) => page.getByRole('dialog').filter({ has: page.locator('.gl-top') })
async function scrollLens(page, to, ms = 1400) {
  await page.evaluate(([to]) => {
    const el = document.querySelector('.gl-scroll')
    const target = to === 'bottom' ? el.scrollHeight : typeof to === 'string' ? document.querySelector(to).offsetTop - 70 : to
    el.scrollTo({ top: target, behavior: 'smooth' })
  }, [to])
  await page.waitForTimeout(ms)
}

async function continueAll(a) {
  for (let i = 0; i < 3; i++) {
    const cont = a.page.getByRole('button', { name: /^Continue$/i })
    if (await cont.count() && await cont.first().isVisible()) { await a.tap(cont.first()); await a.hold(1700) } else break
  }
}

// The garden camera follows the pet, so mushrooms are found by their cap colour in a live screenshot.
async function findMushrooms(page) {
  const shot = (await page.screenshot({ scale: 'css' })).toString('base64')
  return page.evaluate(async (src) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const { data, width } = g.getImageData(0, 0, c.width, c.height)
    const cells = new Map()
    for (let y = 170; y < Math.min(c.height - 200, 760); y += 2) for (let x = 6; x < width - 6; x += 2) {
      const i = (y * width + x) * 4, r = data[i], gg = data[i + 1], b = data[i + 2]
      if (r > 170 && gg > 80 && gg < 150 && b > 55 && b < 120 && r - gg > 55) {
        const k = `${Math.floor(x / 26)},${Math.floor(y / 26)}`
        const v = cells.get(k) || { n: 0, sx: 0, sy: 0 }; v.n++; v.sx += x; v.sy += y; cells.set(k, v)
      }
    }
    return [...cells.values()].filter((v) => v.n >= 14).map((v) => ({ x: Math.round(v.sx / v.n), y: Math.round(v.sy / v.n), n: v.n }))
      .sort((p, q) => q.n - p.n)
  }, shot)
}

async function habitWalk(a) {
  const { page } = a
  await a.hold(1500)
  const did = page.getByRole('button', { name: /I did it/i }).first()
  let found = false
  for (let attempt = 0; attempt < 6 && !found; attempt++) {
    const spots = await findMushrooms(page)
    if (!spots.length) break
    const s = spots[Math.min(attempt, spots.length - 1)]
    a.mark('tap-mushroom', s)
    await a.tapAt(s.x, s.y + 4)
    try { await did.waitFor({ timeout: 6000 }); found = true } catch { await a.hold(400) }
  }
  if (!found) { await page.screenshot({ path: path.join(out, 'mushroom-miss.png') }); throw new Error('no mushroom hit') }
  a.mark('habit-screen')
  await a.hold(2200)
  await a.tap(did)
  a.mark('habit-done')
  await a.hold(3600)
  await continueAll(a)
}

try {
  // ---------- Main journey: live AI ----------
  const m = await makePage()
  const { page } = m
  await onboard(m, GOOD, { record: true, slow: true })

  await m.start('garden', 'companion walks to a habit mushroom, habit completed, Today checklist')
  await m.hold(2500)
  await habitWalk(m, 365, 432)
  await m.hold(1500)
  await m.tap(page.getByRole('button', { name: /QUESTS/i }).last())
  m.mark('checklist')
  await m.hold(3800)
  await m.tap(page.getByRole('button', { name: /^Close$/i }).last())
  await m.hold(2000)
  await m.stop()

  await m.start('lens-jar', 'GreenLens: privacy notice, describe the jar, live AI quest, add to quests')
  await m.hold(1200)
  await m.tap(lensButton(page))
  m.mark('privacy')
  await m.hold(3800)
  await m.tap(dialog(page).getByRole('button', { name: 'Got it' }))
  await m.hold(1600)
  const describe = dialog(page).getByLabel('Or describe something')
  await m.tap(describe)
  await describe.pressSequentially('An empty glass pasta sauce jar, rinsed, lid still on', { delay: 45 })
  await m.hold(700)
  await m.tap(dialog(page).getByRole('button', { name: 'Find a quest' }))
  m.mark('loading')
  await dialog(page).locator('.gl-quest').waitFor({ timeout: 70000 })
  m.mark('result')
  await m.hold(4500)
  await scrollLens(page, '.gl-quest-title', 1600)
  await m.hold(4500)
  await scrollLens(page, '.gl-reward', 1600)
  await m.hold(2500)
  await m.tap(dialog(page).getByRole('button', { name: 'Add to my quests' }))
  m.mark('added')
  await m.hold(2500)
  await m.stop()
  log.jarQuest = await dialog(page).locator('.gl-quest').innerText()

  await m.start('lens-confirm', 'Confirm the real-life action: I did it, honest confirm, server reward, back to garden')
  await scrollLens(page, '.gl-mine', 1500)
  await m.hold(1200)
  await m.tap(dialog(page).getByRole('button', { name: /^I did it:/ }).first())
  m.mark('really-done')
  await m.hold(3800)
  await m.tap(dialog(page).getByRole('button', { name: 'Yes, I did it' }))
  await dialog(page).getByRole('heading', { name: 'Quest complete!' }).waitFor({ timeout: 20000 })
  m.mark('quest-complete')
  await m.hold(4500)
  await m.tap(dialog(page).getByRole('button', { name: 'Back to the garden' }))
  m.mark('garden-celebrate')
  await m.hold(6000)
  await continueAll(m)
  await m.hold(1500)
  await m.stop()

  await m.start('lens-second', 'Second, different input: vague note -> one clarifying question -> different quest with curated links')
  await m.hold(1000)
  await m.tap(lensButton(page))
  await m.hold(1500)
  const placeBox = dialog(page).locator('.gl-place input')
  await m.tap(placeBox)
  await placeBox.pressSequentially('Ontario', { delay: 60 })
  await m.hold(500)
  await scrollLens(page, 0, 900)
  const d2 = dialog(page).getByLabel('Or describe something')
  await m.tap(d2)
  await d2.pressSequentially('a few of these from my kitchen drawer', { delay: 45 })
  await m.hold(600)
  await m.tap(dialog(page).getByRole('button', { name: 'Find a quest' }))
  m.mark('loading')
  await dialog(page).locator('.gl-ask, .gl-quest').first().waitFor({ timeout: 70000 })
  if (await dialog(page).locator('.gl-ask').count()) {
    m.mark('clarify')
    log.clarifyQuestion = await dialog(page).locator('.gl-ask p').innerText()
    await m.hold(3500)
    const ans = dialog(page).getByLabel('Your answer')
    await m.tap(ans)
    await ans.pressSequentially('Dead AA batteries', { delay: 60 })
    await m.hold(600)
    await m.tap(dialog(page).getByRole('button', { name: 'Get my quest' }))
    m.mark('loading2')
    await dialog(page).locator('.gl-quest').waitFor({ timeout: 70000 })
  }
  m.mark('result')
  await m.hold(4000)
  await scrollLens(page, '.gl-quest-title', 1500)
  await m.hold(3500)
  if (await dialog(page).locator('.gl-sources').count()) { await scrollLens(page, '.gl-sources', 1500); m.mark('sources'); await m.hold(4000) }
  await m.stop()
  log.secondQuest = await dialog(page).locator('.gl-quest').innerText()

  await m.start('reload', 'Progress saved in this browser survives a reload')
  await m.tap(dialog(page).getByRole('button', { name: 'Close GreenLens' }))
  await m.hold(2500)
  m.mark('before-reload', { chips: await page.locator('.chip').allInnerTexts() })
  await m.hold(800)
  await page.reload()
  m.mark('reloaded')
  await page.getByRole('button', { name: /QUESTS/i }).last().waitFor({ timeout: 30000 })
  await m.hold(3500)
  m.mark('after-reload', { chips: await page.locator('.chip').allInnerTexts() })
  await m.tap(lensButton(page))
  await m.hold(1500)
  await scrollLens(page, '.gl-mine', 1200)
  m.mark('done-tag')
  await m.hold(3000)
  await m.stop()
  await m.context.close()

  // ---------- Failure: provider unavailable ----------
  const f = await makePage()
  await onboard(f, BAD)
  await f.start('lens-fail', 'Provider fails (invalid key on this server): labelled prerecorded tip, then normal garden play')
  await f.hold(1000)
  await f.tap(lensButton(f.page))
  await f.hold(1200)
  await f.tap(dialog(f.page).getByRole('button', { name: 'Got it' }))
  await f.hold(900)
  const fd = dialog(f.page).getByLabel('Or describe something')
  await f.tap(fd)
  await fd.pressSequentially('An empty glass jar', { delay: 45 })
  await f.hold(500)
  await f.tap(dialog(f.page).getByRole('button', { name: 'Find a quest' }))
  f.mark('loading')
  await dialog(f.page).locator('.gl-quest').waitFor({ timeout: 90000 })
  f.mark('fallback')
  await f.hold(5000)
  await f.tap(dialog(f.page).getByRole('button', { name: 'Close GreenLens' }))
  f.mark('garden')
  await habitWalk(f, 128, 355)
  await f.hold(1500)
  await f.stop()
  await f.context.close()

  // ---------- Shipped proof on the public deployment ----------
  const dk = await makePage({ width: 1440, height: 900, dpr: 1, mobile: false })
  await dk.page.goto(LIVE + '/')
  await dk.page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 30000 })
  await dk.start('live-desktop', `Public deployment ${LIVE}, desktop browser, fresh session: onboarding then garden`)
  await onboard(dk, LIVE, { slow: true, navigate: false })
  await dk.hold(3000)
  await dk.stop()
  await dk.context.close()

  const lp = await makePage()
  await lp.page.goto(LIVE + '/')
  await lp.page.getByRole('button', { name: 'Continue' }).waitFor({ timeout: 30000 })
  await lp.start('live-phone', `Public deployment ${LIVE}, phone viewport, fresh session: onboarding, one habit, reload keeps progress`)
  await onboard(lp, LIVE, { slow: true, navigate: false })
  await habitWalk(lp, 365, 432)
  await lp.hold(1500)
  lp.mark('before-reload', { chips: await lp.page.locator('.chip').allInnerTexts() })
  await lp.page.reload()
  lp.mark('reloaded')
  await lp.page.getByRole('button', { name: /QUESTS/i }).last().waitFor({ timeout: 30000 })
  await lp.hold(3500)
  lp.mark('after-reload', { chips: await lp.page.locator('.chip').allInnerTexts() })
  await lp.tap(lp.page.getByRole('button', { name: /QUESTS/i }).last())
  lp.mark('checklist')
  await lp.hold(3500)
  await lp.stop()
  await lp.context.close()
  console.log('capture complete', out)
} catch (error) {
  log.errors.push(String(error.stack))
  console.error(error)
} finally {
  await save()
  await browser.close()
  await fs.writeFile(path.join(root, 'captures', 'latest-greenlens.json'), JSON.stringify({ directory: out }, null, 2))
}
