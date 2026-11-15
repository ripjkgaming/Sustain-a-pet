import { createServer } from 'node:net'
import { defineConfig, devices } from '@playwright/test'
import { SENTINEL_KEY, SENTINEL_SECRET } from './e2e/constants.js'

// Production smoke suite. It builds the app, then runs the real Node server (server/index.js) with the
// test-only AI mock enabled, on a free port. Set BASE_URL to test an already running server instead.
//
// A dummy sentinel key is set for the build and the server. e2e/secrets.e2e.js asserts it never appears in dist/.

// Pick a free port once; Playwright re-evaluates this file in workers, so pass it through the environment.
async function freePort() {
  if (process.env.E2E_PORT) return Number(process.env.E2E_PORT)
  const server = createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  process.env.E2E_PORT = String(port)
  return port
}

const PORT = await freePort()
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`

const mobileLayout = { grep: /@layout/ }

export default defineConfig({
  testDir: './e2e',
  // Both suffixes. vitest only scans src/ and tests/ (see vite.config.js), so e2e/ is safe.
  testMatch: '**/*.{e2e,spec}.js',
  // greenlens-flow.e2e.js is an older exploratory flow, not part of the smoke suite.
  testIgnore: '**/greenlens-flow.e2e.js',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: process.env.E2E_OUTPUT_DIR || 'test-results/e2e',
  use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // EMULATED mobile: Chromium with the device viewport, user agent, touch and pixel ratio.
    // These are not real iPhone or Pixel devices, and the iPhone project is not WebKit/Safari.
    { name: 'EMULATED-iPhone-13', ...mobileLayout, use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'EMULATED-Pixel-7', ...mobileLayout, use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run build && node server/index.js',
        url: `${baseURL}/healthz`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: {
          // Build and run with the sentinel so a leak into dist/ is detectable.
          OPENROUTER_API_KEY: SENTINEL_KEY,
          QUEST_SIGNING_SECRET: SENTINEL_SECRET,
          NODE_ENV: '',
          AI_MOCK: '1',
          HOST: '127.0.0.1',
          PORT: String(PORT),
          // The suite makes many API calls from one IP; the 429 scenario is simulated in the browser.
          RATE_LIMIT_MAX: '1000',
          UPSTREAM_RETRY_BASE_MS: '10',
        },
      },
})
