# Architecture

Sustain-a-Pet is a Vite single-page app. Everything except GreenLens runs in the browser. GreenLens adds one server endpoint, `POST /api/eco-quest`, which asks an AI model for one small real-world action and then does all reward and completion decisions in code.

Related docs: [MODEL_CONFIG.md](MODEL_CONFIG.md) (environment variables, model chain, timeouts), [AI_DISCLOSURE.md](AI_DISCLOSURE.md) (what AI does and what data it receives).

## Components

| Area | Files | Role |
| --- | --- | --- |
| Game engine | `src/engine.js`, `src/game.js`, `src/store.js` | Pure rules and reducer. Saves to `localStorage`, with an in-memory fallback. |
| GreenLens UI | `src/components/GreenLens.jsx` | Capture, privacy notice, clarifying question, quest list, confirmed completion. |
| GreenLens client | `src/greenLensClient.js` | Shrinks the photo, builds the request body, maps server responses and error codes to UI state. |
| Shared quest contract | `src/ecoQuest.js` | Model JSON schema, `validateQuest`, denylist, confidence labels, `pickServerFields`. Used by server and client. |
| Reward table | `src/rewards.js` | Deterministic XP, coins and leaves from category and difficulty. |
| Curated sources | `src/recyclingSources.js` | Fixed list of recycling organisation links, matched from free-text location. |
| Fallback tips | `src/ecoQuestFallbacks.js` | Five hand-written tips used when no live result is available. |
| Shared constants | `src/ecoQuestConfig.js` | Timeouts, text and location limits, token TTL, fallback label. |
| Quest endpoint | `api/eco-quest.js` | `generateQuest` (model call and validation) and `completeQuest` (completion ledger). Default export is the handler used by dev and preview. |
| Tokens | `api/_questToken.js` | HMAC-SHA256 signed quest tokens. |
| Completion ledger | `api/_completions.js` | In-memory duplicate and daily-cap store. |
| Production server | `server/index.js`, `server/config.js`, `server/upstream.js`, `server/rateLimit.js` | One Node process: serves `dist/` and the API, with limits, retries, timeouts and logging. |
| Dev and preview bridge | `vite.config.js`, `server/ecoQuestMiddleware.js` | Mounts the default handler on the Vite dev and preview servers. |
| Eval set | `eval/` | Cases, fixtures, deterministic checks, mocked suite and on-demand real-model runner. |

## Two ways the endpoint runs

1. **Production: `node server/index.js`** (the Dockerfile `CMD`). Serves the built app from `dist/` and handles `/api/eco-quest`, `/healthz` and `/readyz`. This is the only path that applies the server rules below: JSON content-type check, token-bucket rate limit, bounded upstream retries, the 40-second server timeout and JSON request logs.
2. **Development and preview: `vite` and `vite preview`.** `vite.config.js` mounts `server/ecoQuestMiddleware.js`, which calls the default handler in `api/eco-quest.js`. That handler has a simpler fixed-window rate limit, no retries and no content-type check.

Both paths share `generateQuest` and `completeQuest`, so validation, rewards, tokens and status codes for the business logic are the same.

The repo has no `vercel.json` and no serverless function config. `netlify.toml` and `public/_redirects` send every path, including `/api/*`, to `index.html`. On a static-only host the API does not exist. Run the Node server (Docker or `node server/index.js`) for live GreenLens.

## Data flow

```
GreenLens.jsx
  -> greenLensClient.js  downscale photo (1024 px JPEG, q 0.82), build body, add clientId
  -> POST /api/eco-quest
       server/index.js   method, rate limit, JSON content-type, body size, JSON parse, 40 s timeout
       api/eco-quest.js  parseInput -> model chain (OpenRouter, strict json_schema)
                         -> extractJson -> validateQuest (clamp, strip HTML and URLs, denylist)
                         -> finishQuest: reward from table, curated sources, signed token
                         -> or fallbackResponse: prerecorded tip, labelled, also tokenised
  <- { kind: 'quest' | 'clarify', ... }
  -> user taps "Yes, I did it"
  -> POST /api/eco-quest  { action: 'complete', token, clientId }
       completeQuest     verify token -> duplicate check -> daily cap -> record -> reward from table
  <- { ok, reward: { xp, coins, leaves }, dailyUsed, dailyMax }
  -> reducer completeAiQuest (src/game.js) pays the server reward only
```

### Request side (`generateQuest`)

- Needs `image` (data URL: JPEG, PNG or WebP, base64, at most 3.5 MB decoded) or `text` (at most 200 characters after trim).
- Optional: `clarification` (at most 200 characters), `history` (up to 5 recent completed quests: title, category, date), `constraints.location` (free text, at most 60 characters), `clientId` (8–64 characters, letters, digits, `-` or `_`).
- Invalid input returns `400 bad_body` before any model call.
- No `OPENROUTER_API_KEY` returns `503 ai_unconfigured` before any model call.

### Model output side

- The model must return JSON matching `QUEST_SCHEMA` (`src/ecoQuest.js`). Prose or code fences around the object are tolerated: `extractJson` takes the first `{...}` span.
- `validateQuest` rules:
  - Required: `object`, `title`, `action`, `why`. Empty required text rejects the output.
  - Text fields are cut to length limits (object 60, title 80, action 200, why 300, caveat 160, personalization_note 160), with HTML tags and URLs removed.
  - `confidence` must be `high`, `medium` or `low`, or the output is rejected.
  - `category` and `difficulty` are normalised to the known values. Unknown values become `other` and `easy`.
  - Any `xp`, `coins` or reward field the model adds is ignored.
  - A denylist match in any text field rejects the output.
- Clarifying question: if no answer has been given yet and the model returns `clarifying_question`, the server keeps only the first question, cut at the first `?` and at most 160 characters. It returns `kind: 'clarify'` with no quest and no token. After one answer the server never asks again: the prompt says so, and any question still returned forces `confidence: 'low'` and is then ignored.
- Anything rejected, or any upstream failure, goes to the fallback path below.

### Deterministic decoration (`finishQuest`)

- `reward` comes from `rewardFor(category, difficulty)` in `src/rewards.js`. See [MODEL_CONFIG.md](MODEL_CONFIG.md#rewards).
- `sources` are set only for category `recycle`, from `sourcesForLocation`. Other categories get `[]`. If no curated source matches, `source_note` is `No curated source covers your location`.
- The token is a signed copy of `{ v, qid, cat, diff, cid, iat, exp }`. The token carries no XP. Completion recomputes the reward from the category and difficulty it names.

## Fallback

When the model times out, fails, or returns unusable output, the server still returns HTTP 200 with a prerecorded tip (`pickFallback` in `src/ecoQuestFallbacks.js`). The tip is chosen deterministically from the note, clarification and image size.

The response is labelled in every field the UI reads:

- `live: false`, `fallback: true`, `source: 'prerecorded'`, `model: null`
- `fallback_label: "Prerecorded tip, not a live AI result"`
- `fallback_reason`: `timeout`, `upstream_failed` (network error, or non-retryable upstream status such as 400, 401 or 403), or `invalid_model_output`

Fallback quests get a token and can be completed. They pay the same server-side reward as a live quest. This is current behaviour and not a deliberate product rule; see [ARCHITECTURE.md#known-limitations](#known-limitations).

## Completion (`completeQuest`)

Completion decisions happen only on the server. The model and the client cannot grant rewards.

1. `clientId` must match `CLIENT_ID_RE`, else `400 bad_body`.
2. The token must verify (HMAC, version 1, not expired), else `403 invalid_token`. If the token was issued for a `clientId`, that must match the request.
3. Duplicate: key `clientId|quest id|UTC day the quest was issued`. A second completion returns `409 already_completed`.
4. Daily cap: at most `MAX_AI_QUESTS_PER_DAY` (3) completions per `clientId` per UTC day. Over the cap returns `429 daily_cap`.
5. Record, then return `{ ok, questId, reward, dailyUsed, dailyMax, day }`.

The client checks the same cap against its own state (`aiDailyUsed`, reducer in `src/game.js`) using the local date. Server and client day boundaries can differ near midnight.

## Timeouts

Each layer must outlive the one inside it. `loadConfig` throws at startup if the production values break this order.

| Layer | Value | Env var | What happens on expiry |
| --- | --- | --- | --- |
| Client fetch | 45 s | `CLIENT_TIMEOUT_MS` in `src/ecoQuestConfig.js` (not an env var) | Client shows a timeout message. |
| Server request | 40 s | `SERVER_TIMEOUT_MS` | `504` with `gateway_timeout` JSON. Rarely reached, since the upstream deadline is shorter. |
| Upstream (one deadline for the whole model chain and all retries) | 30 s | `UPSTREAM_TIMEOUT_MS` | Fallback response, HTTP 200, `fallback_reason: timeout`. |

Retries (production server only) use `UPSTREAM_MAX_RETRIES` (0 to 2 per request, shared across the model chain). They apply to network errors, 429 and 5xx, with exponential backoff from `UPSTREAM_RETRY_BASE_MS` (400 ms), capped at 4 s, with full jitter. A retry never sleeps past the upstream deadline.

## Rate limits and request limits

- Production server (`server/rateLimit.js`): token bucket per client IP, `RATE_LIMIT_MAX` (10) tokens refilled over `RATE_LIMIT_WINDOW_MS` (60 s). Over the limit returns `429 rate_limited` with `Retry-After`. The client IP comes from `X-Forwarded-For` only when `TRUST_PROXY` is set.
- Dev and preview handler (`api/eco-quest.js`, `checkRate`): fixed window of 10 requests per minute per IP. It trusts `X-Forwarded-For` unconditionally.
- Body size: `MAX_BODY_BYTES` (6 MB) on the server returns `413 payload_too_large`.
- Content-type: the server requires `application/json` and returns `415` otherwise.

Both rate limits apply to both the generate and the complete actions.

## HTTP status summary (`POST /api/eco-quest`)

| Status | Body `error` | When |
| --- | --- | --- |
| 200 | (none) | `kind: 'quest'`, `kind: 'clarify'`, or labelled fallback. |
| 400 | `bad_body` | Invalid JSON, invalid fields, missing image and text, bad `clientId`. |
| 403 | `invalid_token` | Forged, malformed, expired or wrong-client token. |
| 405 | `method_not_allowed` | Not POST. |
| 409 | `already_completed` | Quest already completed. |
| 413 | `payload_too_large` | Body over `MAX_BODY_BYTES`. |
| 415 | `unsupported_media_type` | Server only: content-type is not JSON. |
| 429 | `rate_limited` or `daily_cap` | Rate limit, or the 3-per-day completion cap. |
| 503 | `ai_unconfigured` | `OPENROUTER_API_KEY` not set. |
| 504 | `gateway_timeout` | Server only: 40 s request timeout. |
| 500 | `server_error` | Unexpected error. |

## Health and readiness (server only)

- `GET /healthz` always returns `200 {"status":"ok"}`.
- `GET /readyz` returns `200` when the SPA's `index.html` exists in `DIST_DIR` and `OPENROUTER_API_KEY` is set (or `AI_MOCK` is on). Otherwise it returns `503` and lists the missing names. It never returns values.

## Logging

The production server writes one JSON line per request with these fields:

- `ts` (ISO time), `level` (`info`, or `error` for status 500 and above), `msg` (`request`)
- `request_id` (taken from `X-Request-Id` if valid, else generated), `method`, `path` (no query string)
- `status`, `latency_ms`, `model` (upstream model id, or `null`)
- `error_category`: `validation`, `rate_limit`, `payload_too_large`, `upstream_timeout`, `upstream_error`, `internal` or `none`
- `upstream_retries`, only when retries happened

Other lines: `listening` at startup, `fatal` (exit 1) on bad configuration, `shutting_down` on SIGTERM or SIGINT. `console.*` output is rewritten as JSON lines with `ts`, `level` and `msg`, for example `[eco-quest] model=... answered`.

Request bodies, photos, base64 data, notes and credentials are not logged. The dev handler logs the model id and status only, and validation error codes rather than user text.

## Storage

### Server

Everything the server keeps is in memory. Nothing is written to disk.

- Completion ledger (`api/_completions.js`): `Map`s holding a key (`clientId|quest id|UTC day`) and counts. Cleaned when they pass 5000 entries.
- Rate limit buckets (`server/rateLimit.js` and `api/eco-quest.js`).
- Signing secret: random per process when `QUEST_SIGNING_SECRET` is unset or shorter than 16 characters.
- Request bodies, photos and notes are not stored. They exist only for the length of the request.

### Browser (per browser and device)

Player progress lives in the browser's `localStorage`. It is per browser and per device, is cleared when site data is cleared, and is not synced anywhere. If storage is blocked, the app keeps an in-memory copy that is lost on reload.

Exact keys, verified by grepping `src/`:

| Key | Value | Written in |
| --- | --- | --- |
| `sustain-a-pet` | Game save (JSON). `Duo.jsx` reads the companion sprite from the same key. | `src/store.js` (`REAL_KEY`) |
| `sustain-pet-muted` | `'1'` muted, `'0'` sound on | `src/sfx.js` |
| `sustain-pet-tutorial-v1` | `'in-progress'` or `'done'` | `src/App.jsx` (`TUTORIAL_KEY`) |
| `sustain-pet-allDone-<YYYY-MM-DD>` | `'1'` once the all-habits celebration shows that local day | `src/App.jsx` |
| `sustain-a-pet-client` | Random client id, 8–64 characters of `A-Z a-z 0-9 _ -` | `src/greenLensClient.js` (`CLIENT_ID_KEY`) |
| `sustain-pet-greenlens-privacy-v1` | `'yes'` after the GreenLens privacy notice | `src/greenLensClient.js` (`PRIVACY_KEY`) |
| `sustain-pet-greenlens-place` | Optional town or region, up to 60 characters | `src/greenLensClient.js` (`PLACE_KEY`) |

Cache Storage (offline app files) is separate. See [OFFLINE.md](OFFLINE.md).

The app keeps no database and no accounts.

## Known limitations

- **Server state is per process.** Completion ledger, rate limits and the ephemeral signing secret reset on restart and are not shared across instances. Running two instances, or any serverless platform, weakens duplicate and cap checks and invalidates tokens minted by another instance. Use a shared store and a fixed `QUEST_SIGNING_SECRET` before relying on these checks. The code comment in `api/_completions.js` says the same.
- **`clientId` is not authentication.** It is random and kept in `localStorage`. Clearing storage gives a new id and a new daily cap. The caps limit honest overuse and casual farming, not a determined attacker.
- **Fallback tips pay rewards.** A prerecorded tip is tokenised and completes with the same reward as a live quest. Decide whether that is intended.
- **Invalid or revoked API key looks like an outage.** A key that is set but rejected (401 or 403) does not return `503`. It returns a labelled fallback tip with `fallback_reason: upstream_failed`. Only the server logs show the status.
- **Denylist is small and regex-based.** `DENY` in `src/ecoQuest.js` catches a short list of harmful terms. It does not detect other unsafe handling advice. The server does not check unsafe handling advice beyond that list. Safety depends on the prompt and the model.
- **Recycling advice is generic.** The model may not state local rules. Curated sources cover only the regions in `src/recyclingSources.js` (United States, United Kingdom, Ontario, British Columbia, Australia, Ireland). Any other location gets no links.
- **Prompt injection is only partly tested.** Untrusted text is labelled as data in the prompt and the eval set has injection cases. The `injection-sign.png` fixture contains no readable text, so image-text injection is only approximated (see `eval/README.md`).
- **No real-model evaluation results yet.** See [MODEL_CONFIG.md](MODEL_CONFIG.md#evaluation).
- **Caps use different day boundaries.** The server uses the UTC date. The client uses the local date.
- **Free models are unreliable.** Free-tier availability, rate limits and latency are set by OpenRouter and the providers. The fallback chain helps but does not guarantee a live answer.
- **Upstream data handling is outside this app.** Photos and notes are sent to OpenRouter and the model it routes to. Their retention and training terms apply. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).
- **Dev-only trust of `X-Forwarded-For`.** The dev and preview handler trusts this header for rate limiting, so it can be spoofed there. The production server trusts it only with `TRUST_PROXY`.
- **Static hosts cannot run GreenLens.** See the note above on Netlify and Cloudflare Pages.
