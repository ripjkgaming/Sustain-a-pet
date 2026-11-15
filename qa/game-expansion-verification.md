# Game expansion verification

Date: 2026-11-15 (Asia/Singapore)
Application commit: `51efa96`
Environment: Chromium in-app browser; isolated practice copy at `http://127.0.0.1:5174/?demo=1`.

## Automated checks

- `npm test`: 63 tests passed across 5 files.
- `npm run build`: passed. Vite reports a 539 kB constants chunk above its 500 kB advisory threshold.
- `npm run lint`: completed with React/hooks warnings; no lint errors.

## Browser checks

- **Daily gift:** collected the first gift, reloaded, and confirmed the claim button stayed disabled. After advancing the practice copy one simulated day, the next gift was available, the streak reached two days, and the daily habit count reset.
- **Habits and quiz:** opened the Today checklist, completed a habit, answered the daily quiz, and confirmed the result and XP. Completed the remaining habits; the three-action and all-eight quest rewards became available and each could be collected once.
- **Companion progress and caps:** earned 10 XP on Pip, adopted and switched to Mossy, and earned 15 XP there. Switching back showed Pip still at 10 XP. The completed habit and quiz remained disabled for the whole garden after switching companions.
- **Mushroom prompt:** selected a mushroom in the world; the companion walked to it and its daily checkbox appeared. Completing it changed the checkbox to completed and updated the daily count and rewards. The same flow worked after advancing the practice date.
- **Shop and map:** bought the Wildflower patch, put it away, and placed it again. Restored the meadow flower bed; the pond stayed locked until that prerequisite was complete and the required garden XP was reached. Unlocking the pond changed the visible world to the pond habitat. The decoration controls remained available in the shop.
- **Mobile layout:** at a 390 × 844 viewport, the header, camera buttons, garden, daily prompt, demo drawer, vitals and bottom navigation fit on screen. Zoom-in, zoom-out and reset controls responded.
- **Reward feedback:** a daily reward appeared below the header and wallet, clear of the device notch.
- **Practice isolation:** the practice UI stated that the real garden is saved separately. The verification copy used a separate local origin and did not open or modify the real-garden view.

## Additional owner-reported check

The game implementation chat separately reports a practice-save run that completed day-one rewards and quests, restored the meadow bed, unlocked the pond, repaired its footbridge, advanced simulated days, adopted Mossy, unlocked Amber Grove and restored the wishing tree. It reports ending with 45 coins and 9 leaves, using only the demo day-skip controls and not injecting or editing save data. I did not repeat the full Grove progression in my browser.

## Limits

- Reduced-motion behavior was not exercised in the browser: the available browser controls support viewport overrides, but not `prefers-reduced-motion` emulation. The application source and automated spring-stability checks were reviewed separately.
- During an earlier asset export, a temporary hot reload produced a blank WebGL view. It did not recur after the Blender exports completed; the final practice copy loaded and remained playable.
