// Builds the client with dummy sentinel secrets in the environment, then asserts that neither the sentinel
// values nor key-like strings (sk-, sk-or-, ...) appear in any file under the build output.
// The build goes to a temporary directory so a running server's dist/ is left alone.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SENTINEL = 'sk-or-v1-BUNDLESENTINEL0000000000000000000000000000000000000000'
const SENTINEL_SECRET = 'BUNDLE-SENTINEL-signing-secret-0123456789'
const outDir = mkdtempSync(join(tmpdir(), 'sap-bundle-'))

const env = {
  ...process.env,
  OPENROUTER_API_KEY: SENTINEL,
  VITE_OPENROUTER_API_KEY: SENTINEL,
  OPENAI_API_KEY: SENTINEL,
  QUEST_SIGNING_SECRET: SENTINEL_SECRET,
}
const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], { env, stdio: 'inherit' })
if (build.status !== 0) { rmSync(outDir, { recursive: true, force: true }); console.error('build failed'); process.exit(1) }

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const patterns = [/sk-or-[A-Za-z0-9_-]{8,}/, /sk-[A-Za-z0-9_-]{20,}/, /AIza[0-9A-Za-z_-]{35}/, /ghp_[A-Za-z0-9]{36}/]
const hits = []
const files = walk(outDir)
for (const f of files) {
  const buf = readFileSync(f)
  if (buf.includes(SENTINEL) || buf.includes(SENTINEL_SECRET) || buf.includes('BUNDLESENTINEL')) hits.push(`${f}: sentinel`)
  if (/\.(glb|png|jpe?g|webp|m4a|mp3|ogg|woff2?|ico|wasm|ktx2)$/i.test(f)) continue
  const text = buf.toString('utf8')
  for (const re of patterns) if (re.test(text)) hits.push(`${f}: matches ${re}`)
}
rmSync(outDir, { recursive: true, force: true })
if (!files.length) { console.error('FAIL: build output empty'); process.exit(1) }
if (hits.length) { console.error('FAIL: secrets in bundle:\n' + hits.join('\n')); process.exit(1) }
console.log(`PASS: ${files.length} files scanned, no sentinel or key-like string found`)
