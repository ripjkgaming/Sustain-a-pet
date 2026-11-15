# Sustain-a-Pet

**Live URL: not yet deployed**

A virtual pet that grows with small green habits in real life. Pick a companion, explore three garden areas, complete daily habits, answer a quiz, and use the shared garden economy to restore habitats and care for your friends.

The game keeps its progress in your browser (localStorage). There are no accounts and no analytics. The exception is **GreenLens**, an optional AI feature. When you use it, the photo or note you submit is sent to an AI provider through this app's server. See [What GreenLens sends](#what-greenlens-sends).

## Architecture (one supported setup)

- **Game:** a static single-page app (Vite, React, three.js). Built to `dist/`.
- **GreenLens:** one endpoint, `POST /api/eco-quest`. It needs the Node server, not a static host. The server forwards the request to OpenRouter using `OPENROUTER_API_KEY`.
- **Production:** one Node process (`node server/index.js`, or the Docker image) serves `dist/` and the API. This is the only deployment path this repo documents. See [docs/DEPLOY.md](docs/DEPLOY.md).

Without the AI backend, the game still works. GreenLens returns `503 ai_unconfigured`.

## Requirements

- Node.js 22 (the Dockerfile and CI use 22).
- npm.

## Quick start (development)

```bash
npm install
npm run dev          # http://localhost:5173 (Vite also serves /api/eco-quest)
```

To use live GreenLens in development, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. `npm run dev` reads `.env`. `node server/index.js` does not (see [Configuration](#configuration)).

## Production run (one process)

```bash
npm run build
OPENROUTER_API_KEY=... QUEST_SIGNING_SECRET=... NODE_ENV=production node server/index.js
```

The server listens on `PORT` (default `8080`). Open `http://localhost:8080`.

## Docker

```bash
docker build -t sustain-a-pet .
docker run -p 8080:8080 -e OPENROUTER_API_KEY=... -e QUEST_SIGNING_SECRET=... sustain-a-pet
```

The image runs as the `node` user with `NODE_ENV=production`, exposes port 8080, and has a `HEALTHCHECK` on `/healthz`. Deployment steps for a generic container host: [docs/DEPLOY.md](docs/DEPLOY.md).

## Configuration

Every variable in `.env.example` is listed below. Server-side only: never prefix these with `VITE_`, because `VITE_` variables are shipped to the browser. Defaults are the values in code.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | none | OpenRouter API key. Required for live GreenLens. Without it: `POST /api/eco-quest` returns `503 ai_unconfigured` and `/readyz` returns `503`. |
| `OPENROUTER_MODEL` | `nvidia/nemotron-3.5-super-vl:free` | Primary model. Fallback models follow in the chain. The model must accept images. |
| `QUEST_SIGNING_SECRET` | none (random per process) | HMAC key for quest tokens. Use 16+ characters. If unset or shorter, a random per-process secret is used, and tokens stop working after a restart or across instances. |
| `NODE_ENV` | unset | Set to `production` in deployments (the Dockerfile does). Refuses `AI_MOCK` and `AI_BASE_URL` at startup. |
| `PORT` | `8080` | Listen port. |
| `HOST` | `0.0.0.0` | Listen address. |
| `DIST_DIR` | `dist` in the repo root | Directory of the built app. `/readyz` checks for `index.html` in it. |
| `TRUST_PROXY` | off | `1`, `true` or `yes` makes the server take the client IP from `X-Forwarded-For`. Enable only behind a proxy you control. |
| `MAX_BODY_BYTES` | `6291456` (6 MB) | Largest accepted request body. Larger returns `413 payload_too_large`. |
| `RATE_LIMIT_MAX` | `10` | Requests per IP per window on `/api/eco-quest` (token bucket). Over the limit: `429 rate_limited` with `Retry-After`. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window for the rate limit, in milliseconds. |
| `SERVER_TIMEOUT_MS` | `40000` | Whole-request timeout for `/api/eco-quest`. On expiry: `504 gateway_timeout`. Must be below the client timeout (45 s) and above `UPSTREAM_TIMEOUT_MS`. |
| `UPSTREAM_TIMEOUT_MS` | `30000` | One deadline for the whole model chain and all retries. On expiry: a labelled prerecorded tip. |
| `UPSTREAM_MAX_RETRIES` | `2` | Retries per request for network errors, 429 and 5xx. Allowed range 0 to 2. Shared across the model chain. |
| `UPSTREAM_RETRY_BASE_MS` | `400` | Base delay for exponential backoff with full jitter. Capped at 4 s. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Time allowed for in-flight requests after SIGTERM before the process exits. |
| `AI_MOCK` | off | Test only. `1` answers from a built-in fake model. Refused when `NODE_ENV=production`. Applies to `node server/index.js` only. |
| `AI_BASE_URL` | unset | Test only. Sends upstream calls to a local stub at this base URL. Refused when `NODE_ENV=production`. Applies to `node server/index.js` only. |

Client timeout (45 s) is the constant `CLIENT_TIMEOUT_MS` in `src/ecoQuestConfig.js`. It is not an environment variable.

`node server/index.js` does not read `.env`. Export variables in the process environment or pass them with `docker run -e`. Full detail, ranges and the startup checks: [docs/MODEL_CONFIG.md](docs/MODEL_CONFIG.md#environment-variables).

## Where progress is saved

Progress is stored **per browser and per device** in `localStorage`. It is cleared when you clear site data. It is not synced to any server or other device. If storage is blocked, the app keeps an in-memory copy, and that copy is lost on reload.

Exact keys (verified in `src/`):

| Key | Stores | Written in |
| --- | --- | --- |
| `sustain-a-pet` | Game save (JSON). The companion sprite is also read from this key. | `src/store.js`, `src/components/Duo.jsx` |
| `sustain-pet-muted` | `1` sound muted, `0` sound on | `src/sfx.js` |
| `sustain-pet-tutorial-v1` | `in-progress` or `done` | `src/App.jsx` |
| `sustain-pet-allDone-<YYYY-MM-DD>` | `1` after the all-habits celebration was shown that local day | `src/App.jsx` |
| `sustain-a-pet-client` | Random client id (8–64 characters, `A-Z a-z 0-9 _ -`) for GreenLens daily limits | `src/greenLensClient.js` |
| `sustain-pet-greenlens-privacy-v1` | `yes` after the GreenLens privacy notice is acknowledged | `src/greenLensClient.js` |
| `sustain-pet-greenlens-place` | Optional town or region, up to 60 characters | `src/greenLensClient.js` |

The offline app also stores files in the browser's Cache Storage. See [docs/OFFLINE.md](docs/OFFLINE.md).

## What GreenLens sends

GreenLens takes a photo and/or a note (up to 200 characters) and returns one small, safe real-world action. You earn XP, coins and a leaf after you confirm you did it.

Data path:

1. The browser shrinks the photo to a 1024 px JPEG (quality 0.82) and sends `POST /api/eco-quest` **to this app's own origin**. The body can include the photo, the note, a clarification answer, up to 5 recent completed quests (title, category, date), the optional town or region, and a random client id.
2. The server calls OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) with the photo and text. The server forwards the data to the model that OpenRouter routes to.
3. The server does not keep photos, notes or model replies after the response. It keeps only in-memory completion and rate-limit counters, which hold ids and counts, not content. It does not log request bodies, photos, base64 or notes.
4. Retention and training of the data by OpenRouter and the routed model provider are set by their own policies. This repo cannot verify them: **check provider policy** before real users.

Full detail: [docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Timeouts, limits and retries

Timeout order, longest to shortest. Each layer must outlive the one inside it. The server refuses to start if the production values break this order.

| Layer | Default | On expiry |
| --- | --- | --- |
| Client fetch | 45 s | Client shows a timeout message. |
| Server request (`SERVER_TIMEOUT_MS`) | 40 s | `504 gateway_timeout`. |
| Upstream, all models and retries (`UPSTREAM_TIMEOUT_MS`) | 30 s | Labelled prerecorded tip, HTTP 200. |

- **Body:** `MAX_BODY_BYTES`, 6 MB by default. Oversized bodies return `413`.
- **Image:** JPEG, PNG or WebP data URL, at most 3.5 MB decoded.
- **Text:** note at most 200 characters; clarification at most 200; location at most 60.
- **Rate limit:** `RATE_LIMIT_MAX` (10) per `RATE_LIMIT_WINDOW_MS` (60 s) per IP, token bucket.
- **Retries:** up to `UPSTREAM_MAX_RETRIES` (2) per request, for network errors, 429 and 5xx. Backoff starts at `UPSTREAM_RETRY_BASE_MS` (400 ms), capped at 4 s, with full jitter. A retry never runs past the upstream deadline.
- **Model chain:** up to three models. The chain moves on for 404, 429 and 5xx. Other statuses end the chain with a fallback.
- **Daily cap:** 3 AI quest completions per client per UTC day (`MAX_AI_QUESTS_PER_DAY`).

Detail: [docs/ARCHITECTURE.md#timeouts](docs/ARCHITECTURE.md#timeouts) and [docs/MODEL_CONFIG.md](docs/MODEL_CONFIG.md).

## Health, readiness and logs

- `GET /healthz`: `200 {"status":"ok"}` while the process runs.
- `GET /readyz`: `200 {"status":"ready",...}` when `OPENROUTER_API_KEY` is set (or mock mode is on) and `dist/index.html` exists. Otherwise `503 {"status":"not_ready",...,"missing":[...]}` naming the missing settings, never their values. Returns 503 with `draining: true` during shutdown.

Logs are JSON, one line per request, with these fields: `ts`, `level` (`info`, or `error` for 5xx), `msg` (`request`), `request_id`, `method`, `path` (no query string), `status`, `latency_ms`, `model`, `error_category`, and `upstream_retries` when retries happened. Bodies, photos, notes and credentials are never logged. Full field list: [docs/ARCHITECTURE.md#logging](docs/ARCHITECTURE.md#logging).

## Testing and CI

```bash
npm test                                   # Vitest, whole unit and offline eval suite
npx vitest run tests/evalMocked.test.js    # offline eval checks only
npm run lint                               # oxlint
npm run build                              # Vite build to dist/
npm run test:e2e                           # Playwright (see below)
OPENROUTER_API_KEY=... npm run eval:real   # real-model eval, on demand, costs API calls
```

- `npm run test:e2e` builds the app and starts `node server/index.js` with `AI_MOCK=1` and a sentinel key on a free port. Set `BASE_URL` to test a server that is already running. The config includes emulated iPhone 13 and Pixel 7 projects, not real devices. Browsers must be installed first (`npx playwright install chromium`).
- `npm run eval:real` without a key prints `not run: no credentials` and writes nothing.

CI (`.github/workflows/ci.yml`) runs on pushes and pull requests to `main`: Node 22, `npm ci`, `npm run lint`, `npm test`, `npm run build`, then uploads `dist/` as an artifact. It does not run Playwright or `eval:real`.

## Game overview

- Pure game engine (`src/engine.js`): habits, daily decay, mood bands, stages, unlocks, quiz.
- Save and reducer (`src/store.js`) with an in-memory fallback if storage is blocked.
- Three botanical 3D companions (Leafling, Mossy, Sunbud), each with four moods and four growth stages. Editable Blender sources are in `assets/blender/`.
- Standalone model review at `/model-preview.html` on the dev server. It does not touch game saves.
- Seven real-life habits plus a daily quiz (`src/data/habits.json`, `src/data/quiz.json`). Keys `1`–`7` complete habits, `A`/`B`/`C` answer the quiz, `P` pats the companion.
- Shop, Friends and Explore screens for spending, switching companions and restoring the meadow, pond and grove.
- Reward feedback respects the reduced-motion preference.

## Screenshots

<p align="center">
  <img src="docs/screenshots/garden.webp" alt="Starter garden with the Leafling companion" width="200">
  <img src="docs/screenshots/meadow-restored.webp" alt="Garden after restoring the meadow" width="200">
  <img src="docs/screenshots/pond-restored.webp" alt="Restored pond area with the Mossy companion" width="200">
  <img src="docs/screenshots/daily-quiz.webp" alt="Garden journal with daily habits and quiz" width="200">
</p>

## Documentation

- [docs/DEPLOY.md](docs/DEPLOY.md): container deployment, health checks, cache notes, post-deploy checklist.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): components, request flow, storage, logging, known limitations.
- [docs/MODEL_CONFIG.md](docs/MODEL_CONFIG.md): model chain, environment variables, rewards, token and text limits, curated sources, eval status.
- [docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md): what the AI does, what data it receives, how AI was used to build the app.
- [docs/OFFLINE.md](docs/OFFLINE.md): service worker, offline behaviour, update flow.
- [docs/PROD_VALIDATION.md](docs/PROD_VALIDATION.md): dated record of the production server checks.
- [eval/README.md](eval/README.md): GreenLens eval set and runners.

## Sources

GreenLens recycling links come from a fixed list in `src/recyclingSources.js`, not from the AI. They appear only on recycling quests, and only for the regions listed there: United States, United Kingdom, Ontario, British Columbia, Australia and Ireland. Full list and matching rules: [docs/MODEL_CONFIG.md#curated-sources](docs/MODEL_CONFIG.md#curated-sources).

_TODO: list sources for the habit "why" lines and quiz facts._

## Team

_TODO: name who prompted, reviewed and can explain each part._

## License

MIT. See [LICENSE](LICENSE).
