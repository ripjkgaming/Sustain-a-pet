# Production readiness findings

Inspected on 2026-11-15, up to commit `65f840f`. Facts below were verified in code.

## Build tool

- Vite 8 (`vite.config.js`) with `@vitejs/plugin-react` and `vite-plugin-pwa` (generateSW, `registerType: 'autoUpdate'`).
- Rolldown splits three.js and `@react-three/*` into chunks of at most 450 kB.
- `npm run build` writes a static SPA to `dist/`. Unit tests use Vitest (`npm test`, files in `tests/` and `src/*.test.js`).
- Browser tests use Playwright (`npm run test:e2e`, config in `playwright.config.js`, tests in `e2e/*.e2e.js`). The `.e2e.js` suffix keeps Vitest from picking them up.

## How the app is served

- Dev and preview: since `65f840f`, `vite` and `vite preview` both mount `/api/eco-quest` through `server/ecoQuestMiddleware.js`, which calls `api/eco-quest.js`. The middleware gets env values from `loadEnv`, so the key never reaches the client bundle.
- Docker/nginx image: serves static files only, so `/api/eco-quest` does not exist there. The SPA fallback (`try_files ... /index.html`) answers instead of an API, and GreenLens fails.
- Netlify, Cloudflare Pages: static only, with the same gap. No Functions are configured.

## Existing deploy setup to reuse

- `Dockerfile`: multi-stage build. `node:22-alpine` runs `npm ci && npm run build`, then `nginx:alpine` serves `dist/` with `deploy/nginx.conf`. The nginx config covers gzip, immutable `/assets/`, long cache for `/models/` and `.glb` files, `no-cache` for `/` and `index.html`, and the SPA fallback. It has no API proxy.
- `netlify.toml`: build command `npm run build`, publish directory `dist`, cache headers and SPA redirect.
- `public/_redirects` (`/* /index.html 200`) and `public/_headers` are for Cloudflare Pages and Netlify.
- `.github/workflows/ci.yml`: Node 22, `npm ci`, lint, `npm test`, build, upload the `dist` artifact. It does not run Playwright yet.
- `DEPLOY.md` says "No backend ... no environment variables". This is out of date, because GreenLens needs `OPENROUTER_API_KEY` on a server.
- There is no Vercel, Fly, Render or Caddy config.

## Progress in localStorage (exact keys)

| Key | Written by | Content |
| --- | --- | --- |
| `sustain-a-pet` | `src/store.js` (`REAL_KEY`) | JSON of the whole pet/game state (`app.real`), migrated on load by `migrateGame`. Also read by `src/components/Duo.jsx` (`SPRITE_KEY`) for `pet.sprite`. |
| `sustain-pet-tutorial-v1` | `src/App.jsx` (`TUTORIAL_KEY`) | `'in-progress'` or `'done'` |
| `sustain-pet-allDone-<YYYY-MM-DD>` | `src/App.jsx` | `'1'` after the all-done result screen shows that day |
| `sustain-pet-muted` | `src/sfx.js` | `'1'` or `'0'` |

`src/store.js` falls back to an in-memory copy if localStorage throws.

## AI quest generation (GreenLens)

- Client: `src/greenLensClient.js` sends `POST /api/eco-quest` with JSON `{ image?, text? }`. The image is a JPEG data URL, scaled down to 1024 px at quality 0.82. Text is at most 200 characters. The client timeout is 25 s. The client never throws and returns `{ ok: true, quest }` or `{ ok: false, code, status }`.
- Server handler: `api/eco-quest.js` (`handler(req, res, env)`). It accepts POST only (405 otherwise). It applies an in-memory rate limit of 10 requests per minute per IP. It validates the image (jpeg/png/webp base64, at most 3.5 MB) and the text. It calls OpenRouter `https://openrouter.ai/api/v1/chat/completions` with a model chain and one 30 s deadline, then validates the output with `validateQuest` from `src/ecoQuest.js`.
- Environment variables (server-side only, never `VITE_`):
  - `OPENROUTER_API_KEY` (required). Without it, the handler returns `503 ai_unconfigured`.
  - `OPENROUTER_MODEL` (optional). The default is `nvidia/nemotron-3.5-super-vl:free`. Fallbacks are `google/gemma-4-31b-it:free` and `google/gemma-4-26b-a4b-it:free`.

## Host credentials in the environment

- `.env` (git-ignored, mode 600) exists and sets `OPENROUTER_API_KEY` to a non-empty value. The value was not read or printed.
- The shell environment has no Netlify, Vercel, Fly, Render, Railway or Cloudflare tokens, and no `OPENROUTER_*` variables. No host credentials were found, so do not assume a deploy target is available.

## First-visit blank screen (fixed)

- Cause: `src/App.jsx` read `pet.game.areas` in a `useLayoutEffect` on every render. On a first visit, storage is empty, so `pet` is `null`. The render threw before onboarding could show, and the user saw a blank page.
- Fix (commit `3c0f029`): `src/sceneLayout.js` derives the layout safely from `pet?.game`. Unit test: `tests/sceneLayout.test.js`.
- Browser regression test: `e2e/first-visit.e2e.js` starts with empty storage and service workers blocked. It asserts that the onboarding "Continue" button and the "Choose your pet" radiogroup are visible, with no page errors or console errors. It passes against `vite build` + `vite preview`. It fails against the pre-fix `src/App.jsx` from `a9fc88a`.
