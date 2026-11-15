# Sustain-a-Pet

A virtual pet that grows with small green habits in real life. Pick a companion, explore three garden areas, complete daily habits, answer a quiz, and use the shared garden economy to restore habitats and care for your friends.

Everything stays on your device (localStorage). No accounts, no tracking.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine + store tests
npm run build
```

Practice garden: open `/?demo=1`. It has its own saved copy; the Today journal explains that your real garden is saved separately and offers a **Back to my garden** button.

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

Open **Today** to collect the daily gift and review the seven real-life habits and daily quiz. The three-habit and all-eight garden quests provide one-time daily bonuses. Use **Shop**, **Friends** and **Explore** to spend coins and leaves, care for or switch companions, visit areas and restore their landmarks.

The practice garden is useful for exploring the game without changing your real garden. Open it with `/?demo=1`; use **Back to my garden** to leave it.

## AI-use disclosure

Written with Claude Code (Anthropic). _Team: expand this section with who prompted, reviewed and can explain each part._

## Sources

_TODO: list sources for the habit "why" lines and quiz facts._
