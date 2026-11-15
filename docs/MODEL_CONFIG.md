# Model configuration

Every value below is read from the code named in the table. Set environment variables on the server (Docker `-e`, host secret manager, or `.env` for `npm run dev` only; see [Loading `.env`](#loading-env)).

## Model chain

The model chain is built by `modelChain()` in `api/eco-quest.js`:

1. `OPENROUTER_MODEL`, if set (trimmed). Otherwise the default.
2. Then the default and the two fallbacks, skipping any already listed.
3. The chain is cut to **three** models.

| Position | Default (`OPENROUTER_MODEL` unset) | `OPENROUTER_MODEL=x/y:free` |
| --- | --- | --- |
| 1 | `nvidia/nemotron-3.5-super-vl:free` | `x/y:free` |
| 2 | `google/gemma-4-31b-it:free` | `nvidia/nemotron-3.5-super-vl:free` |
| 3 | `google/gemma-4-26b-a4b-it:free` | `google/gemma-4-31b-it:free` |

A custom primary model therefore drops `google/gemma-4-26b-a4b-it:free` from the chain. Choose a model that accepts images, because the photo is sent as an `image_url` part.

Each model is tried in order. The chain moves on for HTTP 404, 429 and 5xx. Any other failed status ends the chain and returns a fallback. A network error or timeout also ends the chain. The chain shares one 30-second upstream deadline.

The `model` field in the response is the `model` echoed by OpenRouter, or the requested id if OpenRouter does not echo one. It is `null` on a fallback.

All requests go to `https://openrouter.ai/api/v1/chat/completions` with `response_format: { type: 'json_schema', json_schema: { name: 'eco_quest', strict: true, schema: QUEST_SCHEMA } }`. Headers are `Authorization: Bearer <OPENROUTER_API_KEY>`, `HTTP-Referer: http://localhost` and `X-Title: eco-quest`. The referer and title are generic on purpose and identify no one.

## Environment variables

### AI provider

| Variable | Required | Default | Where read | Effect |
| --- | --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | For live quests | none | `api/eco-quest.js` (`generateQuest`), `server/config.js` (`missingConfig`) | Missing: `POST /api/eco-quest` returns `503 ai_unconfigured` and `/readyz` returns `503`. Server-only. Never prefix with `VITE_`. |
| `OPENROUTER_MODEL` | No | `nvidia/nemotron-3.5-super-vl:free` | `api/eco-quest.js` (`modelChain`) | Primary model. See [Model chain](#model-chain). |
| `QUEST_SIGNING_SECRET` | Yes in production | random per process | `api/_questToken.js` (`signingSecret`) | HMAC key for quest tokens. Must be at least 16 characters. A shorter value is ignored, and an ephemeral secret is used. The log line then says "not set", which is misleading in that case. Ephemeral tokens stop working after a restart and across instances. |

### Server

| Variable | Default | Effect |
| --- | --- | --- |
| `NODE_ENV` | unset | `production` (set in the Dockerfile) refuses `AI_MOCK` and `AI_BASE_URL` at startup. |
| `PORT` | `8080` | Listen port, integer 0 to 65535. |
| `HOST` | `0.0.0.0` | Listen address. |
| `DIST_DIR` | `dist` next to the repo root | Directory of the built app. `/readyz` checks for `index.html` in it. |
| `MAX_BODY_BYTES` | `6291456` (6 MB) | Largest accepted request body. Larger returns `413`. Minimum 1024. |
| `RATE_LIMIT_MAX` | `10` | Token-bucket capacity per IP for `/api/eco-quest`. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Refill window for the bucket. Minimum 1000. |
| `TRUST_PROXY` | off | `1`, `true` or `yes` makes the server read the client IP from `X-Forwarded-For`. Enable only behind a proxy you control. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Time to finish in-flight requests after SIGTERM before exit. |

### Timeouts and retries

| Variable | Default | Range | Effect |
| --- | --- | --- | --- |
| `SERVER_TIMEOUT_MS` | `40000` | at least 1000 | Whole-request timeout. On expiry: `504 gateway_timeout`. |
| `UPSTREAM_TIMEOUT_MS` | `30000` | at least 1000 | One deadline for the whole model chain and all retries. On expiry: labelled fallback. |
| `UPSTREAM_MAX_RETRIES` | `2` | 0 to 2 | Retries per request for network errors, 429 and 5xx. Shared across the chain. |
| `UPSTREAM_RETRY_BASE_MS` | `400` | 1 to 10000 | Base for exponential backoff with full jitter, capped at 4 s. |

Client timeout is `CLIENT_TIMEOUT_MS = 45000` in `src/ecoQuestConfig.js`. It is a code constant, not an environment variable.

`loadConfig()` in `server/config.js` refuses to start when:

- `UPSTREAM_TIMEOUT_MS` is not lower than `SERVER_TIMEOUT_MS`, or
- `SERVER_TIMEOUT_MS` is not lower than the client timeout (45000).

Any integer variable outside its range also stops startup. Startup prints a `fatal` JSON line and exits with code 1.

### Test-only switches

| Variable | Effect |
| --- | --- |
| `AI_MOCK` | `1`, `true` or `yes` answers from a built-in fake upstream. The mock also honours note text `mock:500`, `mock:429` and `mock:hang`. |
| `AI_BASE_URL` | Sends upstream calls to `<AI_BASE_URL>/chat/completions`. |

Both are refused when `NODE_ENV=production`. `/readyz` reports `"mock": true` only in mock mode.

Only `node server/index.js` (`createApp` in `server/index.js`) reads these two variables. `npm run dev` and `vite preview` mount `server/ecoQuestMiddleware.js`, which calls OpenRouter directly. In those modes `AI_MOCK=1` has no effect: without `OPENROUTER_API_KEY` the endpoint returns `503 ai_unconfigured`.

### Eval runner

| Variable | Default | Effect |
| --- | --- | --- |
| `EVAL_DELAY_MS` | `4000` | Pause between cases in `npm run eval:real`. |
| `EVAL_CASE_TIMEOUT_MS` | `45000` | Per-case upstream timeout in `npm run eval:real`. |
| `QUEST_SIGNING_SECRET` | `eval-run-signing-secret-1234` (fallback in the runner only) | The runner uses this value if the variable is unset. |

## Loading `.env`

- `npm run dev` and `npm run preview` load `.env` through Vite (`loadEnv` in `vite.config.js`). Every variable is passed to the dev middleware. Only `VITE_`-prefixed variables reach the browser bundle, and none of the variables above use that prefix.
- `node server/index.js` does not read any `.env` file. Export the variables in the process environment or pass them with `docker run -e`.
- `.env.example` lists the variables. `.env` and `.env.*` are git-ignored.

## Rewards

Defined in `src/rewards.js`.

- `XP = clamp(BASE[category] + BONUS[difficulty], 5, 15)`, rounded to an integer.
- `BASE`: reuse 6, repair 7, recycle 6, save_water 6, save_energy 6, reduce_waste 6, transport 7, other 5.
- `BONUS`: easy 0, medium 2, hard 4.
- `coins = xp + 5`. `leaves = 1`.

The highest possible base plus bonus is 11, so in practice XP ranges from **5 to 11**. The clamp to 15 never applies.

Unknown category becomes `other`. Unknown difficulty becomes `easy`. Model-supplied XP, coins and leaves are never read.

Completion reads the reward from the token's category and difficulty, then returns it. The reducer (`completeAiQuest` in `src/game.js`) pays only the server's `reward`, after `clampReward`.

## Quest and token rules

| Rule | Value | Where |
| --- | --- | --- |
| Completions per client per UTC day | 3 (`MAX_AI_QUESTS_PER_DAY`) | `src/ecoQuest.js`, enforced in `completeQuest` |
| Token lifetime | 24 h (`QUEST_TOKEN_TTL_MS`) | `src/ecoQuestConfig.js` |
| Token format | `base64url(payload).base64url(HMAC-SHA256)`, payload version 1, at most 1000 characters | `api/_questToken.js` |
| Quest id | `ai-` plus FNV-1a hash of title and action | `validateQuest` in `src/ecoQuest.js` |
| Duplicate key | `clientId`, quest id and UTC day the quest was issued | `completeQuest` in `api/eco-quest.js` |
| Text limits | object 60, title 80, action 200, why 300, caveat 160, personalization 160, clarifying question 160 characters | `src/ecoQuest.js` |
| User note, clarification, location | 200, 200, 60 characters | `api/eco-quest.js`, `src/ecoQuestConfig.js` |
| History sent to the model | last 5 completed quests | `MAX_HISTORY_ITEMS` |
| Image | JPEG, PNG or WebP base64 data URL, 3.5 MB decoded maximum | `api/eco-quest.js` |
| Client photo size | longest edge 1024 px, JPEG quality 0.82 | `src/greenLensClient.js` |

## Curated sources

Listed in `src/recyclingSources.js`. Sources are attached only to `recycle` quests, and only when the free-text location matches exactly one region. Matching is whole-word for names. Abbreviations count only as the last comma-separated part of the location, in capitals. "New England" is not treated as England. Several matches give no sources.

| Region | Matched by | Sources |
| --- | --- | --- |
| United States | US state names, `United States`, `USA`, `US`, two-letter state codes | EPA Recycling basics (epa.gov/recycle), Earth911 (earth911.com) |
| United Kingdom | `United Kingdom`, `UK`, `Great Britain`, `England`, `Scotland`, `Wales`, `Northern Ireland` | Recycle Now (recyclenow.com), WRAP (wrap.ngo) |
| Ontario, Canada | `Ontario`, `ON` | Recycling Council of Ontario (rco.on.ca) |
| British Columbia, Canada | `British Columbia`, `BC` | Recycle BC (recyclebc.ca) |
| Australia | `Australia`, Australian states, `NSW`, `QLD`, `TAS`, `ACT` | Recycling Near You, Planet Ark (recyclingnearyou.com.au) |
| Ireland | `Ireland`, `Republic of Ireland` | MyWaste.ie (mywaste.ie) |

Only URLs in this list survive. The model cannot add links. The client also requires `https://` URLs.

## Evaluation

The eval set lives in `eval/`. See `eval/README.md` for the case format and checks.

### Mocked suite (offline, runs in CI)

```bash
npm test                                   # whole suite, includes the eval checks
npx vitest run tests/evalMocked.test.js    # eval suite only
```

The mocked suite feeds scripted model outputs through the real server pipeline. It checks validation, sanitising, deterministic rewards, the one-question rule, fallback labels and the eval checkers themselves. It measures no real model.

### Real-model run (on demand)

```bash
OPENROUTER_API_KEY=... npm run eval:real
```

- Without `OPENROUTER_API_KEY`, the script prints `not run: no credentials` and exits 0. It writes nothing.
- With a key, it calls `generateQuest` for each case that is not marked `realRun: false`, with a delay between cases. It scores each result with `eval/checks.js`.
- It writes `eval/results/latest.json`. That directory has its own `.gitignore`, so the file is not committed.
- Fallback responses are counted separately. They say nothing about model quality.

### Status

**Not run.** `eval/results/latest.json` does not exist, and no real-model numbers have been recorded. Do not quote evaluation results until a real run writes that file.
