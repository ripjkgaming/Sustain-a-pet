# Game expansion verification

Date: 2026-11-15 (Asia/Singapore)
Application commit: `9089a1c`
Environment: Chromium in-app browser; isolated practice copy at `http://127.0.0.1:5174/?demo=1`.

## Automated checks

- `npm test`: 63 tests passed across 5 files.
- `npm run build`: passed. Vite reports a 539 kB constants chunk above its 500 kB advisory threshold.
- `npm run lint`: completed with React/hooks warnings; no lint errors.

## Browser checks

- **Daily gift:** collected the first gift, reloaded, and confirmed the claim button stayed disabled. After advancing the practice copy one simulated day, the next gift was available, the streak reached two days, and the daily habit count reset.
- **Habits and quiz:** opened the Today checklist, completed a habit, answered the daily quiz, and confirmed the result and XP. Completed the remaining habits; the three-habit and all-eight quest rewards became available and each could be collected once.
- **Companion progress and caps:** earned 10 XP on Pip, adopted and switched to Mossy, and earned 15 XP there. Switching back showed Pip still at 10 XP. The completed habit and quiz remained disabled for the whole garden after switching companions.
- **Mushroom prompt:** selected a mushroom in the world; the companion walked to it and its daily checkbox appeared. Completing it changed the checkbox to completed and updated the daily count and rewards. The same flow worked after advancing the practice date.
- **Shop and map:** bought the Wildflower patch, put it away, and placed it again. Restored the meadow flower bed; the pond stayed locked until that prerequisite was complete and the required garden XP was reached. Unlocking the pond changed the visible world to the pond habitat. The decoration controls remained available in the shop.
- **Mobile layout:** at a 390 × 844 viewport, the header, camera buttons, garden, daily prompt, demo drawer, vitals and bottom navigation fit on screen. Zoom-in, zoom-out and reset controls responded.
- **Practice isolation:** the practice UI stated that the real garden is saved separately. The verification copy used a separate local origin and did not open or modify the real-garden view.

## Limits

- Reduced-motion behavior was not exercised in the browser: the available browser controls support viewport overrides, but not `prefers-reduced-motion` emulation. The application source and automated spring-stability checks were reviewed separately.
- During an earlier asset export, a temporary hot reload produced a blank WebGL view. It did not recur after the Blender exports completed; the final practice copy loaded and remained playable.
