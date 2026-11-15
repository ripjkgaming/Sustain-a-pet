# Deploying Sustain-a-Pet

Sustain-a-Pet is a static Vite single-page app. No backend, no database, no environment variables. Game saves live in the visitor's browser (localStorage).

## Build

```bash
npm install
npm run build    # writes static files to dist/
npm run preview  # optional: serve dist/ locally on http://localhost:4173
```

Deploy the contents of `dist/`.

## Option 1: DeployXA (static host)

Upload or publish the `dist/` folder as a static site.

## Option 2: DeployXA (Docker)

The repo includes a `Dockerfile` that builds the app and serves `dist/` with nginx (config in `deploy/nginx.conf`).

```bash
docker build -t sustain-a-pet .
docker run -p 8080:80 sustain-a-pet
```

Open http://localhost:8080.

## Cloudflare Pages

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | Set `NODE_VERSION` to match your local `node -v` if the build fails |

Cache and SPA rules are read from `public/_headers` and `public/_redirects`, which Vite copies into `dist/`.

## Netlify

`netlify.toml` at the repo root sets the build command and publish directory:

- Build command: `npm run build`
- Publish directory: `dist`

Connect the repo in Netlify and it picks up `netlify.toml` automatically. Cache and SPA rules are in `public/_headers` and `public/_redirects`.

## Cache and SPA notes

- **Hashed assets** (`dist/assets/*`) have content hashes in their names. They can be cached for a long time.
- **`index.html`** must not be cached long. It points to the current hashed assets. A stale `index.html` after a deploy loads old code.
- **SPA fallback:** every unknown path must serve `index.html`. Reloading a deep link must not return 404.
- After a deploy, check the live URL in a private window. If the page looks old, purge the host or CDN cache.

## Real-phone over cellular checklist

Run this on real hardware, not a desktop emulator. Use cellular data, not Wi-Fi.

Setup:
- [ ] Turn Wi-Fi off on the phone. Confirm cellular is active.
- [ ] Use one iPhone (Safari) and one Android phone (Chrome).
- [ ] Open the live URL in a private/incognito tab.

Load and routing:
- [ ] Page loads without a blank screen. The 3D companion renders (WebGL works).
- [ ] Reload on a deep link or after navigating. It serves the app, not a 404.
- [ ] Note the load time on cellular. It stays acceptable on a slow connection.

Core play:
- [ ] Select a mushroom in the garden. The companion walks to it and the habit checkbox appears.
- [ ] Complete a habit from the Today checklist. Coins/XP update.
- [ ] Answer the daily quiz.
- [ ] Switch companion from Friends. Growth progress stays per companion.
- [ ] Buy an item in Shop and place a decoration.

Touch and layout:
- [ ] Pinch/zoom and on-screen zoom and reset buttons work.
- [ ] Buttons and checkboxes are easy to tap (no mis-taps on neighbors).
- [ ] Layout fits a small phone in portrait and rotated to landscape. No clipped controls.
- [ ] Stage-up and share overlays fill the screen and close.

Persistence and motion:
- [ ] Close the tab, reopen. Progress is still there.
- [ ] With the OS "reduce motion" setting on, the animations are reduced.
- [ ] No console errors on first load (use remote debugging: Safari Web Inspector / Chrome `chrome://inspect`).

Record the device model, OS version, browser version, and any failures before sign-off.
