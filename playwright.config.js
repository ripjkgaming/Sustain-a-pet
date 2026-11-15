import { defineConfig, devices } from '@playwright/test'

// Browser tests run against the production build served by `vite preview`.
// Set BASE_URL to test an already running server (for example a deployed URL).
const PORT = Number(process.env.PREVIEW_PORT || 4173)
const baseURL = process.env.BASE_URL || `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // *.e2e.js, not *.spec.js, so vitest does not pick these up.
  testMatch: '**/*.e2e.js',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
