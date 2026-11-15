# Production server and validation

Validated on 2026-11-15 (local, with podman; `docker` is not installed on this machine).

## Architecture

One Node process (`server/index.js`, plain `node:http`, no runtime dependencies) serves the built SPA from `dist/` and the API. It reuses the existing handlers in `api/eco-quest.js` (`generateQuest`, `completeQuest`), so product logic is unchanged. `vite dev` and `vite preview` still mount the same handler through `server/ecoQuestMiddleware.js` for local work.

```
npm run build   # writes dist/
npm start       # node server/index.js, listens on $PORT (default 8080)
```

The old nginx image (`deploy/nginx.conf`) was removed, because it served no API. The Dockerfile now runs this server. Netlify and Cloudflare Pages configs (`netlify.toml`, `public/_redirects`, `public/_headers`) are static-only and have no `/api/eco-quest`: use the Node server (Docker or any Node host) for the full app.

## Behaviour

| Area | Rule |
| --- | --- |
| Credentials | `OPENROUTER_API_KEY` and `QUEST_SIGNING_SECRET` are read from server env only. No `VITE_` variables exist for them. |
| `/api/*` | Always JSON. Unknown route 404, wrong method 405 (with `Allow`), bad JSON or shape 400, wrong content type 415, oversized 413, rate limited 429, server timeout 504, internal 500. It never serves `index.html`. |
| SPA fallback | Only GET/HEAD for paths with no file extension, outside `/api` and `/assets`. Missing files with an extension (for example `/missing.js`, `/assets/x.js`) return 404 text, not `index.html`. |
| Body limit | `MAX_BODY_BYTES`, default 6 MB (6291456). The client sends one JPEG scaled to 1024 px (usually under 1 MB). The handler accepts images up to 3.5 MB (4.7 MB as base64). The server checks `Content-Length` first and also counts streamed bytes. |
| Input validation | Done by `api/eco-quest.js`: image must be a base64 jpeg, png or webp data URL of at most 3.5 MB; text at most 200 characters; history, constraints and `clientId` shape checks. |
| Rate limit | Per-IP token bucket on `/api/eco-quest`: `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` (default 10 per 60 s). Over the limit: 429 with `Retry-After`. State is in memory (resets on restart, not shared between instances). `X-Forwarded-For` is trusted only when `TRUST_PROXY=1`. |
| Retries | Network errors, 429 and 5xx only, at most `UPSTREAM_MAX_RETRIES` (default 2, max 2) per request in total. Exponential backoff with full jitter (`UPSTREAM_RETRY_BASE_MS`, default 400 ms). A retry never sleeps past the upstream deadline. 400, 401 and 404 are not retried (404 moves to the next model in the existing chain). |
| Fallback | The existing model chain (primary, then two fallback models) stays. If every model fails or times out, the handler returns its existing labelled prerecorded tip (`live: false`, `fallback: true`, `source: "prerecorded"`, `fallback_label`). The app never labels this as live AI output. |
| Probes | `GET /healthz`: 200 while the process runs. `GET /readyz`: 200 only when `OPENROUTER_API_KEY` is set (or mock mode is on) and `dist/index.html` exists. Otherwise 503 with `missing` listing config names only. It reports `"mock": true/false`. It returns 503 with `draining: true` during shutdown. |
| Logs | One JSON line per request: `ts`, `level`, `request_id`, `method`, `path` (no query), `status`, `latency_ms`, `model`, `error_category` (`validation`, `rate_limit`, `payload_too_large`, `upstream_timeout`, `upstream_error`, `internal`, `none`), plus `upstream_retries` when retries happened. Request bodies, photos, base64, notes and credentials are never logged. `console.*` is rewritten to JSON lines. 404/405 on static paths count as `validation`. |
| Headers | CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP on every response; HSTS when `X-Forwarded-Proto: https`. Hashed `/assets/*`: `public, max-age=31536000, immutable`. `index.html`, `/`, `sw.js`, `registerSW.js`, `workbox-*.js`, `manifest.webmanifest`: `no-cache`. `/models/*`, `/textures/*`: 30 days. `/api/*`: `no-store`. ETag and 304 supported. Brotli or gzip for text assets, models and wasm. |
| Shutdown | SIGTERM and SIGINT: `/readyz` turns 503, the server stops accepting, idle connections close, in-flight requests finish, then exit 0. A forced exit follows after `SHUTDOWN_TIMEOUT_MS` (default 10 s). |
| Mock upstream | `AI_MOCK=1` answers with a built-in fake model (`mock-model`); `AI_BASE_URL` sends upstream calls to a local stub. Notes containing `mock:500`, `mock:429` or `mock:hang` simulate upstream failures. Both are refused at startup when `NODE_ENV=production` (the Docker image sets it), and `/readyz` reports `"mock": true`. |

## Timeout ordering

Longest to shortest, so the inner layer fails first and the outer layer can still report it:

| Layer | Default | Where |
| --- | --- | --- |
| Client fetch | 45 s | `CLIENT_TIMEOUT_MS` in `src/ecoQuestConfig.js` |
| Server request | 40 s | `SERVER_TIMEOUT_MS` (JSON 504 on expiry) |
| Upstream AI | 30 s | `UPSTREAM_TIMEOUT_MS` (one deadline for all models and retries) |

`loadConfig()` refuses to start if the server value is not below 45 s, or the upstream value is not below the server value. The same comment is in `server/config.js`.

## Environment variables

See `.env.example`: every variable is listed with a comment and no real secret.

## Tests

`npm test` runs `tests/server.test.js` (config guards, token bucket, retry and backoff, readiness with and without key, JSON for every `/api` case, 413/415/405/429/504, SPA fallback and 404 for assets, traversal, headers, compression, log content). `npm run lint` runs oxlint. The Playwright first-visit test also passes against this server (`BASE_URL=http://127.0.0.1:18090 npx playwright test`).

## Docker validation (verbatim)

Image: `podman build -t sustain-a-pet:test .`. Runtime stage is `node:22-alpine`, runs as uid 1000 (`node`), has no `node_modules`. Podman's default OCI format ignores `HEALTHCHECK`; `podman build --format docker` honours it, and `podman healthcheck run` returned exit 0 with status `healthy`. A fake placeholder key was used for the "with key" case (the real key in `.env` was not used), so the upstream answered 401 and the labelled fallback was returned. Response headers `Content-Security-Policy`, `Permissions-Policy`, `Cross-Origin-*`, `X-Frame-Options`, `Referrer-Policy`, `Date`, `Keep-Alive` and `Connection` are filtered from the transcript for length. Large JSON bodies are cut at 400 characters.

Not validated here: a live OpenRouter call with a real key, and a hosted deployment (no host credentials exist in this environment).

```
### A. no key (NODE_ENV=production from image, port 18081)

$ curl http://127.0.0.1:18081/healthz
HTTP/1.1 200 OK
X-Request-Id: 7e8e0813-dec7-4874-b697-58b9d0cf0dc6
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 15
Cache-Control: no-store

{"status":"ok"}


$ curl http://127.0.0.1:18081/readyz
HTTP/1.1 503 Service Unavailable
X-Request-Id: 8869fe27-b16e-4b74-bcc0-0f6962b39284
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 68
Cache-Control: no-store

{"status":"not_ready","mock":false,"missing":["OPENROUTER_API_KEY"]}


$ curl -X POST http://127.0.0.1:18081/api/eco-quest -H Content-Type: application/json -d {"text":"plastic bottle"}
HTTP/1.1 503 Service Unavailable
X-Request-Id: 5709e41f-2db5-452c-ba18-b2aacc636ba7
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 27
Cache-Control: no-store

{"error":"ai_unconfigured"}

{"ts":"2026-11-15T15:53:50.508Z","level":"info","msg":"listening","port":8080,"mock":false,"missing_config":["OPENROUTER_API_KEY"]}
{"ts":"2026-11-15T15:53:52.324Z","level":"info","msg":"request","request_id":"7e8e0813-dec7-4874-b697-58b9d0cf0dc6","method":"GET","path":"/healthz","status":200,"latency_ms":24.9,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:53:52.353Z","level":"error","msg":"request","request_id":"8869fe27-b16e-4b74-bcc0-0f6962b39284","method":"GET","path":"/readyz","status":503,"latency_ms":2.2,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:53:52.390Z","level":"error","msg":"request","request_id":"5709e41f-2db5-452c-ba18-b2aacc636ba7","method":"POST","path":"/api/eco-quest","status":503,"latency_ms":6.9,"model":null,"error_category":"internal"}
--- SIGTERM test
sap-nokey
{"ts":"2026-11-15T15:53:52.390Z","level":"error","msg":"request","request_id":"5709e41f-2db5-452c-ba18-b2aacc636ba7","method":"POST","path":"/api/eco-quest","status":503,"latency_ms":6.9,"model":null,"error_category":"internal"}
{"ts":"2026-11-15T15:53:54.417Z","level":"info","msg":"shutting_down","signal":"SIGTERM"}
exit=0

### B. with a placeholder key (fake value; upstream unreachable/unauthorised) port 18082

$ curl http://127.0.0.1:18082/readyz
HTTP/1.1 200 OK
X-Request-Id: 35708fab-42b2-435a-89dc-e94239410c5c
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 44
Cache-Control: no-store

{"status":"ready","mock":false,"missing":[]}


$ curl -X POST http://127.0.0.1:18082/api/eco-quest -H Content-Type: application/json -d {"text":"plastic bottle"}
HTTP/1.1 200 OK
X-Request-Id: 3541f44c-b682-48b2-8382-07cbc18edde7
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 1033
Cache-Control: no-store

{"kind":"quest","quest":{"id":"ai-b4027dd4","object":"Household recycling","title":"Check your local recycling rules","action":"Look up your local council recycling guide and check one item you were unsure about.","why":"Rules differ by area, and wrong items can spoil a recycling load.","category":"recycle","difficulty":"easy","xp":6,"confidence":"low","confidence_label":"Low confidence: this may 


$ curl -X POST http://127.0.0.1:18082/api/eco-quest -H Content-Type: application/json -d {"nothing":1}
HTTP/1.1 400 Bad Request
X-Request-Id: e6d9739b-d2d6-4ca6-9187-eec8df526ed3
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 55
Cache-Control: no-store

{"error":"bad_body","message":"image or text required"}


$ curl -X POST http://127.0.0.1:18082/api/eco-quest -H Content-Type: application/json -d {bad json
HTTP/1.1 400 Bad Request
X-Request-Id: c6d338ec-3ced-4181-bb41-d8484c759e37
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 55
Cache-Control: no-store

{"error":"bad_body","message":"body is not valid JSON"}


$ curl -X POST http://127.0.0.1:18082/api/eco-quest -H Content-Type: text/plain -d hi
HTTP/1.1 415 Unsupported Media Type
X-Request-Id: 2ef42a32-b599-4c7d-9e40-26047afca420
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 84
Cache-Control: no-store

{"error":"unsupported_media_type","message":"Content-Type must be application/json"}


$ curl -X GET http://127.0.0.1:18082/api/eco-quest
HTTP/1.1 405 Method Not Allowed
X-Request-Id: 2331131a-efc9-4d13-a638-7f7c21febd24
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 30
Cache-Control: no-store
Allow: POST

{"error":"method_not_allowed"}


$ curl http://127.0.0.1:18082/api/unknown
HTTP/1.1 404 Not Found
X-Request-Id: 49a9cbeb-886d-47ec-babb-1462591ce54e
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 21
Cache-Control: no-store

{"error":"not_found"}

### oversized (7 MB body)

$ curl -X POST http://127.0.0.1:18082/api/eco-quest -H Content-Type: application/json --data-binary @/tmp/sapval/big.json
HTTP/1.1 100 Continue

HTTP/1.1 413 Payload Too Large
X-Request-Id: 902ab0a9-6abe-49a9-9565-181bd44e8602
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 49
Cache-Control: no-store

{"error":"payload_too_large","max_bytes":6291456}

### static + SPA

$ curl -I http://127.0.0.1:18082/
HTTP/1.1 200 OK
X-Request-Id: 0b05b5c0-0349-4c9d-a084-507e302a1f15
X-Content-Type-Options: nosniff
Cache-Control: no-cache
ETag: W/"404-1a1dfe9ade0"
Vary: Accept-Encoding
Content-Type: text/html; charset=utf-8
Content-Length: 1028



$ curl -I http://127.0.0.1:18082/some/deep/link
HTTP/1.1 200 OK
X-Request-Id: 38f79cd1-7582-4292-aefd-1d2c24d06294
X-Content-Type-Options: nosniff
Cache-Control: no-cache
ETag: W/"404-1a1dfe9ade0"
Vary: Accept-Encoding
Content-Type: text/html; charset=utf-8
Content-Length: 1028



$ curl -I http://127.0.0.1:18082/missing.js
HTTP/1.1 404 Not Found
X-Request-Id: 3cea8e63-a8b8-444b-a798-44c0d93c52c4
X-Content-Type-Options: nosniff
Cache-Control: no-store
Content-Type: text/plain; charset=utf-8



$ curl -I http://127.0.0.1:18082/assets/missing-abc.js
HTTP/1.1 404 Not Found
X-Request-Id: 61d9ed1f-f22b-4a28-a310-0ba42902878c
X-Content-Type-Options: nosniff
Cache-Control: no-store
Content-Type: text/plain; charset=utf-8



$ curl -I -H Accept-Encoding: br http://127.0.0.1:18082/assets/three-DFYKutPr.js
HTTP/1.1 200 OK
X-Request-Id: eb4f049e-22b9-4fac-86b1-7a7e2d7d6c30
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable
ETag: W/"5e094-1a1dfe9ade0"
Vary: Accept-Encoding
Content-Type: text/javascript; charset=utf-8
Content-Encoding: br
Content-Length: 82114



$ curl -I -H Accept-Encoding: gzip http://127.0.0.1:18082/assets/three-DFYKutPr.js
HTTP/1.1 200 OK
X-Request-Id: 9765ca4b-65bb-40b2-88bb-a0c2c57489a1
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable
ETag: W/"5e094-1a1dfe9ade0"
Vary: Accept-Encoding
Content-Type: text/javascript; charset=utf-8
Content-Encoding: gzip
Content-Length: 102549



$ curl -I http://127.0.0.1:18082/sw.js
HTTP/1.1 200 OK
X-Request-Id: 2bf7da9b-1dac-4598-ae78-bafc2fde4765
X-Content-Type-Options: nosniff
Cache-Control: no-cache
ETag: W/"d0e-1a1dfe9e0a8"
Vary: Accept-Encoding
Content-Type: text/javascript; charset=utf-8
Content-Length: 3342


### logs
{"ts":"2026-11-15T15:53:56.620Z","level":"info","msg":"listening","port":8080,"mock":false,"missing_config":[]}
{"ts":"2026-11-15T15:53:58.461Z","level":"info","msg":"request","request_id":"35708fab-42b2-435a-89dc-e94239410c5c","method":"GET","path":"/readyz","status":200,"latency_ms":17.7,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:53:58.740Z","level":"info","msg":"[eco-quest] model=nvidia/nemotron-3.5-super-vl:free failed status=401"}
{"ts":"2026-11-15T15:53:58.747Z","level":"info","msg":"[eco-quest] QUEST_SIGNING_SECRET not set: using an ephemeral per-process secret"}
{"ts":"2026-11-15T15:53:58.753Z","level":"info","msg":"request","request_id":"3541f44c-b682-48b2-8382-07cbc18edde7","method":"POST","path":"/api/eco-quest","status":200,"latency_ms":252,"model":null,"error_category":"upstream_error"}
{"ts":"2026-11-15T15:53:58.788Z","level":"info","msg":"request","request_id":"e6d9739b-d2d6-4ca6-9187-eec8df526ed3","method":"POST","path":"/api/eco-quest","status":400,"latency_ms":2.6,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:53:58.818Z","level":"info","msg":"request","request_id":"c6d338ec-3ced-4181-bb41-d8484c759e37","method":"POST","path":"/api/eco-quest","status":400,"latency_ms":1.1,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:53:58.856Z","level":"info","msg":"request","request_id":"2ef42a32-b599-4c7d-9e40-26047afca420","method":"POST","path":"/api/eco-quest","status":415,"latency_ms":1.4,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:53:58.895Z","level":"info","msg":"request","request_id":"2331131a-efc9-4d13-a638-7f7c21febd24","method":"GET","path":"/api/eco-quest","status":405,"latency_ms":1.2,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:53:58.937Z","level":"info","msg":"request","request_id":"49a9cbeb-886d-47ec-babb-1462591ce54e","method":"GET","path":"/api/unknown","status":404,"latency_ms":1.3,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:53:59.038Z","level":"info","msg":"request","request_id":"902ab0a9-6abe-49a9-9565-181bd44e8602","method":"POST","path":"/api/eco-quest","status":413,"latency_ms":1.4,"model":null,"error_category":"payload_too_large"}
{"ts":"2026-11-15T15:53:59.077Z","level":"info","msg":"request","request_id":"0b05b5c0-0349-4c9d-a084-507e302a1f15","method":"HEAD","path":"/","status":200,"latency_ms":3.3,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:53:59.100Z","level":"info","msg":"request","request_id":"38f79cd1-7582-4292-aefd-1d2c24d06294","method":"HEAD","path":"/some/deep/link","status":200,"latency_ms":2.9,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:53:59.122Z","level":"info","msg":"request","request_id":"3cea8e63-a8b8-444b-a798-44c0d93c52c4","method":"HEAD","path":"/missing.js","status":404,"latency_ms":0.8,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:53:59.175Z","level":"info","msg":"request","request_id":"61d9ed1f-f22b-4a28-a310-0ba42902878c","method":"HEAD","path":"/assets/missing-abc.js","status":404,"latency_ms":3.6,"model":null,"error_category":"validation"}
{"ts":"2026-11-15T15:54:00.983Z","level":"info","msg":"request","request_id":"eb4f049e-22b9-4fac-86b1-7a7e2d7d6c30","method":"HEAD","path":"/assets/three-DFYKutPr.js","status":200,"latency_ms":1365.1,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:54:01.039Z","level":"info","msg":"request","request_id":"9765ca4b-65bb-40b2-88bb-a0c2c57489a1","method":"HEAD","path":"/assets/three-DFYKutPr.js","status":200,"latency_ms":30,"model":null,"error_category":"none"}
{"ts":"2026-11-15T15:54:01.075Z","level":"info","msg":"request","request_id":"2bf7da9b-1dac-4598-ae78-bafc2fde4765","method":"HEAD","path":"/sw.js","status":200,"latency_ms":2.4,"model":null,"error_category":"none"}
--- secret leak check (key value in logs?)
0

### C. mock mode (non-production, NODE_ENV unset) port 18083

$ curl http://127.0.0.1:18083/readyz
HTTP/1.1 200 OK
X-Request-Id: 81220046-48e7-4ade-9288-3a0bc9796277
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 43
Cache-Control: no-store

{"status":"ready","mock":true,"missing":[]}


$ curl -X POST http://127.0.0.1:18083/api/eco-quest -H Content-Type: application/json -d {"text":"plastic bottle"}
HTTP/1.1 200 OK
X-Request-Id: f0a560bb-0f63-4ce6-9971-623b02f41463
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 675
Cache-Control: no-store

{"kind":"quest","quest":{"id":"ai-3e613ebf","object":"plastic water bottle","title":"Refill, do not rebuy","action":"Refill a reusable bottle from the tap today.","why":"Single-use bottles add plastic waste.","category":"reuse","difficulty":"easy","xp":6,"confidence":"high","confidence_label":"High confidence: the photo and note looked clear.","reward":{"xp":6,"coins":11,"leaves":1},"sources":[],"

{"ts":"2026-11-15T15:54:05.166Z","level":"info","msg":"[eco-quest] model=nvidia/nemotron-3.5-super-vl:free answered, responded as mock-model"}
{"ts":"2026-11-15T15:54:05.171Z","level":"info","msg":"[eco-quest] QUEST_SIGNING_SECRET not set: using an ephemeral per-process secret"}
{"ts":"2026-11-15T15:54:05.174Z","level":"info","msg":"request","request_id":"f0a560bb-0f63-4ce6-9971-623b02f41463","method":"POST","path":"/api/eco-quest","status":200,"latency_ms":18,"model":"mock-model","error_category":"none"}

### C2. rate limit (RATE_LIMIT_MAX=3), then upstream 5xx retries (mock:500) on a fresh container, port 18084
req 1 -> 200
req 2 -> 200
req 3 -> 200
req 4 -> 429

$ curl -X POST http://127.0.0.1:18084/api/eco-quest -H Content-Type: application/json -d {"text":"mock:500"}
HTTP/1.1 429 Too Many Requests
X-Request-Id: 2d0fec84-a201-4f30-ad02-f21ccea73b62
X-Content-Type-Options: nosniff
Content-Type: application/json; charset=utf-8
Content-Length: 43
Cache-Control: no-store
Retry-After: 20

{"error":"rate_limited","retry_after_s":20}

{"ts":"2026-11-15T15:54:09.008Z","level":"info","msg":"request","request_id":"757316df-ffa2-4c75-b37e-7a5c5b6b7b22","method":"POST","path":"/api/eco-quest","status":200,"latency_ms":112.9,"model":null,"error_category":"upstream_error","upstream_retries":2}
{"ts":"2026-11-15T15:54:09.237Z","level":"info","msg":"request","request_id":"92ddc3eb-6392-4e91-a6c4-2025549a10a5","method":"POST","path":"/api/eco-quest","status":200,"latency_ms":203.9,"model":null,"error_category":"upstream_error","upstream_retries":2}
{"ts":"2026-11-15T15:54:09.449Z","level":"info","msg":"request","request_id":"c8e6c87f-046c-4e5e-a2e4-8268bf91bce8","method":"POST","path":"/api/eco-quest","status":200,"latency_ms":189.8,"model":null,"error_category":"upstream_error","upstream_retries":2}
{"ts":"2026-11-15T15:54:09.489Z","level":"info","msg":"request","request_id":"51a22748-efa7-4456-818f-c68283707561","method":"POST","path":"/api/eco-quest","status":429,"latency_ms":2.7,"model":null,"error_category":"rate_limit"}
{"ts":"2026-11-15T15:54:09.512Z","level":"info","msg":"request","request_id":"2d0fec84-a201-4f30-ad02-f21ccea73b62","method":"POST","path":"/api/eco-quest","status":429,"latency_ms":1.4,"model":null,"error_category":"rate_limit"}

### D. mock refused in production
{"ts":"2026-11-15T15:54:11.134Z","level":"fatal","msg":"AI_MOCK and AI_BASE_URL are test-only and are refused when NODE_ENV=production"}
exit=1
### E. non-root
uid=1000(node) gid=1000(node) groups=1000(node)
```

## E. Playwright smoke suite part 1 (e2e/smoke-core.spec.js, scenarios 1-5)

Run on 2026-11-16, project `chromium`, `--workers=1`, built app served by `server/index.js` with `AI_MOCK=1` (config: `playwright.config.js`). Command: `npx playwright test e2e/smoke-core.spec.js --project=chromium --workers=1 [-g "<n>\. <name>"]`. Output is verbatim.

### Scenario 1 (run alone)
```
  ✓  1 [chromium] › e2e/smoke-core.spec.js:7:1 › 1. fresh onboarding with empty storage, no page errors @layout (18.6s)
  1 passed (51.2s)
```

### Scenario 2 (run alone)
```
  ✓  1 [chromium] › e2e/smoke-core.spec.js:41:1 › 2. habit completion and daily quiz @layout (8.5s)
  1 passed (27.1s)
```

### Scenario 3 (run alone)
```
  ✓  1 [chromium] › e2e/smoke-core.spec.js:75:1 › 3. photo AI quest generation then completion @layout (9.2s)
  1 passed (27.9s)
```

### Scenario 4 (run alone)
```
  ✓  1 [chromium] › e2e/smoke-core.spec.js:93:1 › 4. text AI quest generation then completion (8.6s)
  1 passed (24.5s)
```

### Scenario 5 (run alone)
```
  ✓  1 [chromium] › e2e/smoke-core.spec.js:109:1 › 5. rewards persist after page reload (13.5s)
  1 passed (33.9s)
```

### Whole file
```
Running 5 tests using 1 worker

  ✓  1 [chromium] › e2e/smoke-core.spec.js:19:1 › 1. fresh onboarding with empty storage, no page errors @layout (8.5s)
  ✓  2 [chromium] › e2e/smoke-core.spec.js:41:1 › 2. habit completion and daily quiz @layout (8.4s)
  ✓  3 [chromium] › e2e/smoke-core.spec.js:75:1 › 3. photo AI quest generation then completion @layout (6.1s)
  ✓  4 [chromium] › e2e/smoke-core.spec.js:93:1 › 4. text AI quest generation then completion (5.6s)
  ✓  5 [chromium] › e2e/smoke-core.spec.js:109:1 › 5. rewards persist after page reload (8.0s)

  5 passed (56.4s)
```

Notes:
- Fixed in the test: Continue on the quest sheet closes the quest dialog, so scenario 2 now reopens Quests before checking the 1/ and 2/ counts (assertions not weakened).
- Cause of the earlier timeout: scenarios 2-5 ran the software-rendered WebGL garden scene, which is very slow under load (load average above 50 on 12 cores while other tasks ran). They now use the built-in no-WebGL fallback (`SceneBoundary`). Scenario 1 keeps the real 3D scene.
- `vite.config.js` now sets `test.exclude` so vitest ignores `e2e/**` (it would otherwise load the `.spec.js` file). `playwright.config.js` `testMatch` accepts `*.e2e.js` and `*.spec.js`.
- `e2e/smoke.e2e.js` still holds an older copy of scenarios 1-5 next to 6-9. Remove those from it to avoid running them twice (left alone: another task owns that file).
- One run showed a transient 404 for `/models/quest-mushroom-complete.glb` while another task rebuilt `dist/`. It did not repeat; the file is in `dist/models` and served 200.
- Unfixed app bugs found: none.
