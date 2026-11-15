# Deploying Sustain-a-Pet

**Live URL: not yet deployed**

This is the one supported deployment: a single Node process in a container. The process serves the built game from `dist/` and the GreenLens API at `POST /api/eco-quest`. The repo has no database and no serverless functions.

Why one process: GreenLens needs the server (API key, model calls). Static-only hosts cannot serve `/api/eco-quest`.

## What you need

- A container host that runs an OCI image (Docker or Podman images both work; the image is `node:22-alpine`).
- A secret store or environment-variable settings on that host.
- An OpenRouter API key for live GreenLens. Without it, the game works and GreenLens returns `503 ai_unconfigured`.

## 1. Build the image

```bash
docker build -t sustain-a-pet .
```

The Dockerfile runs `npm ci` and `npm run build` in a build stage, then copies `server/`, `api/`, `src/` and `dist/` into a runtime stage. The runtime stage has no `node_modules`, runs as the `node` user, sets `NODE_ENV=production` and `PORT=8080`, and listens on port 8080.

## 2. Set environment variables on the host

Set these in the host's secret manager or environment settings. Never bake them into the image or commit them.

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | For live GreenLens | Server-side only. |
| `QUEST_SIGNING_SECRET` | Yes for real deployments | 16+ random characters. Generate with `openssl rand -hex 32`. |
| `OPENROUTER_MODEL` | No | Default `nvidia/nemotron-3.5-super-vl:free`. |

All other variables (timeouts, limits, proxy trust) have defaults. The full list with defaults is in the [README configuration table](../README.md#configuration) and [docs/MODEL_CONFIG.md](MODEL_CONFIG.md#environment-variables).

The server refuses to start in production if `AI_MOCK` or `AI_BASE_URL` is set, or if the timeout order is broken.

## 3. Run the container

```bash
docker run -p 8080:8080 \
  -e OPENROUTER_API_KEY=... \
  -e QUEST_SIGNING_SECRET=... \
  sustain-a-pet
```

On a container host, do the same with the host's settings: container port `8080`, the env vars above, and one instance (see limits below).

## 4. Put TLS in front

Terminate HTTPS at the host's load balancer or proxy. Set `TRUST_PROXY=1` only when a proxy you control sets `X-Forwarded-For`. The server sends HSTS only when `X-Forwarded-Proto: https` is present, so keep the proxy setting that header.

## 5. Health checks

| Probe | Path | Healthy response |
| --- | --- | --- |
| Liveness | `GET /healthz` | `200 {"status":"ok"}` |
| Readiness | `GET /readyz` | `200 {"status":"ready",...}`. Returns `503` until the key is set and `dist/index.html` exists, and during shutdown. |

The image's `HEALTHCHECK` calls `/healthz` every 30 s. Point the host's probes at `/healthz` (liveness) and `/readyz` (readiness). Do not route traffic before `/readyz` is `200`.

## 6. Stop and restart

- The process handles SIGTERM. `/readyz` turns 503, the server stops accepting connections, in-flight requests finish, and the process exits 0.
- If shutdown takes longer than `SHUTDOWN_TIMEOUT_MS` (default 10000 ms), the process exits 1.
- Use the host's normal stop signal. Do not use SIGKILL for routine restarts.

## 7. Verify after deploy

1. `curl -sS https://<your-host>/healthz` returns `{"status":"ok"}`.
2. `curl -sS https://<your-host>/readyz` returns `{"status":"ready",...}`.
3. Open the game in a private window. Confirm the deep link reload works (not a 404).
4. Use GreenLens with a real key once. Check the response has `"live":true`. Automated tests in this repo use a mock; a live OpenRouter call is not covered by them.
5. Run the phone checklist below on real devices.

## Limits of this architecture

- **One instance only.** The completion ledger, rate limits and any per-process signing secret live in memory. Two instances, or a restart, weaken the duplicate and daily-cap checks and invalidate tokens minted by another process. Use a fixed `QUEST_SIGNING_SECRET` and a shared store before scaling out. See [ARCHITECTURE.md#known-limitations](ARCHITECTURE.md#known-limitations).
- **Provider data handling** is set by OpenRouter and the routed model provider. Check their policy. See [AI_DISCLOSURE.md](AI_DISCLOSURE.md).

## Rollback

Redeploy the previous image tag. Game saves live in each browser, so a rollback does not touch player progress. Completion and rate-limit state is in memory and resets on any restart.

## Cache and update notes

Cache headers come from `server/index.js` (`cacheControlFor`), with the same rules in `public/_headers` and `netlify.toml` for static hosts:

- **Hashed assets** (`/assets/*`): `public, max-age=31536000, immutable`.
- **`index.html`, `/`, `sw.js`, `sw-extra.js`, `registerSW.js`, `workbox-*.js`, `manifest.webmanifest`**: `no-cache`, so a deploy is picked up at once.
- **`/models/*`, `/textures/*`**: 30 days.
- **`/api/*`**: `no-store`.

After a deploy, check the live URL in a private window. If the page looks old, purge the CDN cache if there is one. Service worker update behaviour: [OFFLINE.md](OFFLINE.md).

## Static-only hosts (not supported for the full app)

`netlify.toml`, `public/_headers` and `public/_redirects` exist so the static game can be served from a static host. Those hosts have no `/api/eco-quest`, so GreenLens fails there. Do not use a static host as the production target for this app.

## Real-phone checklist (manual)

Run on real hardware over cellular, not Wi-Fi and not a desktop emulator. Record device model, OS version and browser version, and any failures before sign-off.

Setup:
- [ ] Turn Wi-Fi off on the phone. Confirm cellular is active.
- [ ] Use one iPhone (Safari) and one Android phone (Chrome).
- [ ] Open the live URL in a private/incognito tab.

Load and routing:
- [ ] Page loads without a blank screen. The 3D companion renders (WebGL works).
- [ ] Reload on a deep link or after navigating. It serves the app, not a 404.
- [ ] Note the load time on cellular.

Core play:
- [ ] Select a mushroom in the garden. The companion walks to it and the habit checkbox appears.
- [ ] Complete a habit from the Today checklist. Coins/XP update.
- [ ] Answer the daily quiz.
- [ ] Switch companion from Friends. Growth progress stays per companion.
- [ ] Buy an item in Shop and place a decoration.

Touch and layout:
- [ ] Pinch/zoom and the on-screen zoom and reset buttons work.
- [ ] Buttons and checkboxes are easy to tap.
- [ ] Layout fits a small phone in portrait and rotated to landscape. No clipped controls.
- [ ] Stage-up and share overlays fill the screen and close.

Persistence and motion:
- [ ] Close the tab, reopen. Progress is still there (same browser only).
- [ ] With the OS "reduce motion" setting on, the animations are reduced.
- [ ] No console errors on first load (Safari Web Inspector / Chrome `chrome://inspect`).
