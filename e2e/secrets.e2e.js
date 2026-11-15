import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { SENTINEL_KEY, SENTINEL_SECRET } from './constants.js'

// No API key or secret may be shipped in the built client. The suite builds and serves with dummy sentinel values.
const DIST = new URL('../dist', import.meta.url).pathname
const KEY_LIKE = [/sk-or-v1-[A-Za-z0-9]{16,}/, /sk-[A-Za-z0-9_-]{32,}/, /AIza[0-9A-Za-z_-]{35}/, /ghp_[A-Za-z0-9]{36}/, /OPENROUTER_API_KEY\s*[:=]\s*["'`][^"'`\s]{8,}/, /Bearer\s+[A-Za-z0-9._-]{24,}/]

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

test('dist/ contains no API key value or key-like string', () => {
  test.skip(!!process.env.BASE_URL, 'needs the local dist/ built with the sentinel')
  const files = walk(DIST)
  expect(files.length).toBeGreaterThan(0)
  const hits = []
  for (const file of files) {
    if (/\.(glb|png|jpe?g|webp|m4a|mp3|ogg|woff2?|ico|wasm|ktx2)$/i.test(file)) {
      // Binary assets: check for the sentinel bytes only.
      const buf = readFileSync(file)
      if (buf.includes(SENTINEL_KEY) || buf.includes(SENTINEL_SECRET)) hits.push(`${file}: sentinel`)
      continue
    }
    const text = readFileSync(file, 'utf8')
    if (text.includes(SENTINEL_KEY)) hits.push(`${file}: sentinel key`)
    if (text.includes(SENTINEL_SECRET)) hits.push(`${file}: sentinel signing secret`)
    for (const re of KEY_LIKE) if (re.test(text)) hits.push(`${file}: matches ${re}`)
  }
  expect(hits).toEqual([])
})
