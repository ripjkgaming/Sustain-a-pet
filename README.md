**Live:** <LIVE_URL_TODO>

# Sustain-a-Pet

A virtual pet that grows with small green habits in real life. Pick a companion, explore three garden areas, complete daily habits, answer a quiz, and use the shared garden economy to restore habitats and care for your friends.

Everything stays on your device (localStorage). No accounts, no tracking. The one exception is GreenLens, the optional AI feature described below, which sends a photo or note to an AI provider when you use it.

## Screenshots

<p align="center">
  <img src="docs/screenshots/garden.webp" alt="Starter garden with the Leafling companion" width="200">
  <img src="docs/screenshots/meadow-restored.webp" alt="Garden after restoring the meadow" width="200">
  <img src="docs/screenshots/pond-restored.webp" alt="Restored pond area with the Mossy companion" width="200">
  <img src="docs/screenshots/daily-quiz.webp" alt="Garden journal with daily habits and quiz" width="200">
</p>

## Offline

- The game runs without a server. Game state is saved in `localStorage`, with an in-memory fallback if storage is blocked (`src/store.js`).
- GreenLens needs the network and the `/api/eco-quest` endpoint. Without them it shows an error, and the rest of the game still works.
- The Nunito font is self-hosted through `@fontsource/nunito` (`src/main.jsx`). No Google Fonts request.
- Audio and 3D models ship with the app in `public/`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (includes /api/eco-quest via Vite)
npm test         # full test suite, including the offline GreenLens eval checks
npm run build
```

Production server (serves `dist/` and `/api/eco-quest`):

```bash
npm run build
OPENROUTER_API_KEY=... QUEST_SIGNING_SECRET=... NODE_ENV=production node server/index.js
```

Or with Docker: `docker build -t sustain-a-pet . && docker run -p 8080:8080 -e OPENROUTER_API_KEY=... -e QUEST_SIGNING_SECRET=... sustain-a-pet`.

## Deploy

See [DEPLOY.md](DEPLOY.md) for DeployXA, Cloudflare Pages, Netlify, and Docker steps, cache notes, and the real-phone test checklist.

GreenLens needs the Node server (Docker or `node server/index.js`). Static-only hosts such as Netlify and Cloudflare Pages serve the game but not `/api/eco-quest`. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What's built

- Pure game engine (`src/engine.js`): habits, daily decay, mood bands, stages, unlocks, quiz.
- Reducer + saving (`src/store.js`) with an in-memory fallback if storage is blocked.
- Three Blender-authored botanical 3D pets (Leafling, Mossy, Sunbud): embedded albedo and normal textures, four moods, and four growth stages. Editable source and rebuild instructions are in `assets/blender/`.
- Standalone model review: open `/model-preview.html` on the dev server to inspect every character, growth stage, health mood, and floating effect without touching game saves.
- Responsive garden with a mushroom for each daily habit. Select a mushroom and your companion walks over; its checkbox appears when the companion arrives. The Today journal also has a direct habit checklist and the daily quiz.
- Daily gifts and habits are shared across companions and capped once per day. The active companion receives habit and quiz XP, and each companion keeps its own growth progress. The Friends screen is where you adopt and switch companions.
- Shop for care items and decorations, place or put away decorations, and restore the meadow before unlocking the pond and grove. Restoration changes the active garden scene.
- Camera controls: use the on-screen zoom and reset buttons, or `+`/`-`, arrow keys and `0`. Keyboard shortcuts `1`–`7` complete habits, `A`/`B`/`C` answer the quiz, and `P` pats your companion.
- Rewards include a tick bounce and leaf burst, quiz confetti, stage-up cutscene, happy dance and unlock toasts. Motion responds to the reduced-motion preference.

## Practice and progress

Open **Today** to collect the daily gift and review the seven real-life habits and daily quiz. The three-action and all-eight garden quests provide one-time daily bonuses. Use **Shop**, **Friends** and **Explore** to spend coins and leaves, care for or switch companions, visit areas and restore their landmarks.

## GreenLens AI

GreenLens turns a photo and/or a short note (up to 200 characters) into one small, safe, real-world green action. You earn 5–11 XP, plus coins and a leaf, once you confirm you did it. The server decides the reward and checks the completion.

Full details, with the file for each claim:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data flow, endpoint, fallback, completion rules, timeouts, limits, known limitations.
- [docs/MODEL_CONFIG.md](docs/MODEL_CONFIG.md): model chain, every environment variable, reward table, evaluation status.
- [docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md): what the AI does, what data it receives, how AI was used to build the app.

Summary:

- The client shrinks the photo to 1024 px JPEG and posts it, with the note and any saved town or region, to `/api/eco-quest`. Accepted images: JPEG, PNG or WebP, up to 3.5 MB.
- The server asks an OpenRouter model for one quest as strict JSON. Model output is validated and cleaned in code. The model cannot set rewards or links.
- Model chain (default): `nvidia/nemotron-3.5-super-vl:free`, then `google/gemma-4-31b-it:free`, then `google/gemma-4-26b-a4b-it:free`. `OPENROUTER_MODEL` sets the first model.
- If the model times out or fails, the server returns a labelled prerecorded tip, not a live AI result.
- Rewards are paid only after `POST /api/eco-quest` with `action: "complete"` confirms the quest. Each quest pays once per client. A client can complete 3 AI quests per UTC day.

Setup:

```bash
cp .env.example .env   # then set OPENROUTER_API_KEY (and QUEST_SIGNING_SECRET for real deployments)
npm run dev            # http://localhost:5173
```

- `OPENROUTER_API_KEY` (required for live quests): without it, `/api/eco-quest` returns `503 ai_unconfigured`. Habits and quests keep working.
- Server-side only. Never prefix these with `VITE_` and never import them into client code. The key must not reach the client bundle. `.env` is git-ignored.
- `node server/index.js` does not read `.env`. Pass variables in the process environment or with `docker run -e`.
- Deployed hosts need `OPENROUTER_API_KEY` and `QUEST_SIGNING_SECRET` in their environment variables.

Safety:

- You must confirm each action ("Yes, I did it") before any reward.
- Rewards come from a fixed table: XP 5–11, coins = XP + 5, one leaf (`src/rewards.js`).
- 3 AI quest completions per client per UTC day (`MAX_AI_QUESTS_PER_DAY`). The server enforces this.
- Each quest pays once. A second completion is rejected with `409 already_completed`.
- Text in photos or notes is untrusted data and cannot override the system prompt.
- The prompt and a small denylist try to keep quests away from medical, legal and dangerous advice. This is not a full safety check.
- Limits to know: completion and rate-limit state is in memory per server process, and the client id is not authentication. See [docs/ARCHITECTURE.md#known-limitations](docs/ARCHITECTURE.md#known-limitations).

## Tests and evaluation

```bash
npm test                                   # whole suite (offline)
npx vitest run tests/evalMocked.test.js    # offline eval checks only
OPENROUTER_API_KEY=... npm run eval:real   # real-model eval, on demand
```

- The mocked eval runs scripted model outputs through the real server pipeline. It checks validation, rewards, the one-question rule and fallback labels. It measures no real model.
- `npm run eval:real` runs the eval cases against the live model. Without `OPENROUTER_API_KEY` it prints `not run: no credentials` and writes nothing. With a key, it writes `eval/results/latest.json` (git-ignored).
- **Real-model eval status: not run.** No real-model results are published yet.

## AI-use disclosure

- **Runtime:** OpenRouter routes GreenLens requests to NVIDIA Nemotron or Google Gemma free models. The models read the photo and/or note and write one quest. Game rewards, links and completion are handled in code.
- **Development:** code, tests and documentation were written with Claude (Anthropic) through Claude Code. Git history has 33 commits with Claude `Co-Authored-By` trailers. A Codex stash label appears in `plans/animation-audit.md`; its role is not recorded.
- Full disclosure, including data sent to the provider: [docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md).

_Team: expand this section with who prompted, reviewed and can explain each part._

## Sources

GreenLens recycling links come from a fixed list, not from the AI. Links appear only on recycling quests, and only for the regions listed in `src/recyclingSources.js`:

- United States: EPA Recycling basics (https://www.epa.gov/recycle), Earth911 (https://earth911.com/)
- United Kingdom: Recycle Now (https://www.recyclenow.com/), WRAP (https://wrap.ngo/)
- Ontario, Canada: Recycling Council of Ontario (https://rco.on.ca/)
- British Columbia, Canada: Recycle BC (https://recyclebc.ca/)
- Australia: Recycling Near You, Planet Ark (https://recyclingnearyou.com.au/)
- Ireland: MyWaste.ie (https://www.mywaste.ie/)

Matching rules and the full list are in [docs/MODEL_CONFIG.md](docs/MODEL_CONFIG.md#curated-sources).

_TODO: list sources for the habit "why" lines and quiz facts._

## License

MIT. See [LICENSE](LICENSE).
