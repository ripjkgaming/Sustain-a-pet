# Animation audit — Sustain-a-Pet

Date: 2026-11-15 (Asia/Singapore). Base commit: `102760d`.
Scope: current working tree, including preserved, uncommitted botanical-model work.
Status: implementation complete in `51efa96`. All ten findings and both missed opportunities below were addressed. The finding table records the original audit state; its fix summaries are no longer outstanding work.

## Recon

- Stack: React 19, Vite, Three.js, React Three Fiber, Drei. No Motion/GSAP dependency.
- Motion locations: `src/index.css` (CSS transitions/keyframes); `src/components/pet3d/` (frame-driven model, camera, world and particle animation); `src/components/LeafFootsteps.jsx` (gait-driven audio polling); `src/App.jsx` (reward timing).
- Tokens: root CSS has color and geometry tokens, but no motion tokens. Existing UI curves independently use overshoot. Three.js animation uses MathUtils.damp and hand-integrated springs. PetRig, Wanderer and Burst cap frame delta at 0.05 seconds; World springs do not.
- Personality: playful botanical companion. Keep breathing, gait, subtle idle motion and rare celebrations.
- Continuous surfaces: pet breathing/sway, face blinking, model foliage, atmosphere, camera following and flower-head rotation. Gait/audio run during travel.
- Tens/day: pet pats, garden navigation, mushroom prompts, checkbox completion, quiz option hover, camera gestures, primary controls.
- Occasional: vital updates, quiz explanations, toast stacks, demo drawer and demo controls.
- Rare: onboarding companion selection/hatching, tutorial, evolution cutscene and stage growth.
- Legacy procedural bodies and old habit-list CSS remain present; findings prioritize mounted botanical models and current garden interactions.

## Vetted findings, ordered by leverage

| # | Severity | Category | Location | Finding | Fix summary |
|---|---|---|---|---|---|
| 1 | MEDIUM | Easing; physicality | `src/index.css:61,81` | Revisited quest prompt enters over 380ms from scale .82, with overshoot and default center origin despite being anchored above a mushroom. | Use 200ms strong ease-out, scale .97, bottom-center origin. |
| 2 | MEDIUM | Performance; stability | `src/components/pet3d/World.jsx:140,183` | Flower and mushroom springs integrate uncapped frame deltas; a stalled frame can destabilize the spring. Nearby rigs cap delta. | Add bounded/substepped integration, preserve spring personality, verify tab resume. |
| 3 | MEDIUM | Performance; duration | `src/index.css:104`; `src/components/Vitals.jsx:8` | All three bars animate width for 700ms, doing layout/paint while the 3D scene runs. | Use left-origin scaleX and a 250ms ease-out; preserve progressbar semantics. |
| 4 | MEDIUM | Accessibility | `src/components/pet3d/shared.js:91`; `src/components/pet3d/World.jsx:140,148,188`; `src/components/pet3d/PetRig.jsx:89,121`; `src/components/pet3d/PetCanvas.jsx:13`; `src/index.css:252` | Reduced-motion preference is a render-time snapshot without a subscription. Flower rotation/wobble, mushroom squash, power-up lift/wave and camera motion remain. CSS globally crushes even useful opacity/color feedback to .01ms. | Subscribe to preference changes, remove decorative spatial movement under reduction, retain gentle opacity/color feedback and usable navigation. |
| 5 | MEDIUM | Interruptibility | `src/components/pet3d/PetCanvas.jsx:48,59` | Timed reset/fit damping continues while OrbitControls accepts drag; gestures can compete with automatic movement. | Cancel reset/fit and pending impulses on interaction start. |
| 6 | MEDIUM | Accessibility | `src/index.css:125,164,200,201` | Hover translation is not gated to a fine pointer, allowing sticky displacement after touch taps. | Gate hover movement with hover/fine-pointer queries. |
| 7 | MEDIUM | Interruptibility | `src/components/Rewards.jsx:12`; `src/App.jsx:66`; `src/index.css:136` | Toasts are inserted/removed directly from a grid; survivors jump when an earlier toast disappears. | Preserve lifecycle through exit and retarget stack positions with interruptible transforms. |
| 8 | MEDIUM | Easing; duration | `src/index.css:119,135` | Quiz explanation takes 400ms with built-in ease for a 4px entrance. | Use 200ms strong ease-out, with opacity-only reduced variant. |
| 9 | LOW | Cohesion | `src/index.css:1,61,112,137,199` | Related interaction curves are independently hardcoded with different overshoot. | Introduce shared ease-out and movement tokens; keep rare celebration styling distinct. |
| 10 | LOW | Physicality | `src/index.css:124,152,189` | Quiz buttons and drawer toggle lack subtle press feedback. | Use scale .97 and 160ms ease-out, respecting disabled controls and reduced motion. |

## Missed opportunities

1. `src/components/DemoDrawer.jsx:13`: the controls mount/unmount instantly, jumping the panel's height while only the chevron animates. Add an interruptible expansion that preserves keyboard accessibility.
2. `src/components/Onboarding.jsx:54`; `src/App.jsx:132`: hatching replaces onboarding immediately. A rare, brief handoff could connect the selected companion to the garden, with an opacity-only reduced alternative.

## Category disposition and limits

All eight playbook categories were reviewed. Purpose/frequency is cleared beyond the repetitive prompt entrance: living-pet movement has a purpose and rare evolution effects fit the product. No ease-in UI declaration, transition:all, or exact CSS scale(0) was found. Centered modal origins are appropriate. Existing reversible checkbox/chevron transitions retarget; particle instancing is appropriate. No deliberate documented tradeoff was rejected. Performance and spring risks are code-based findings, not measured frame-rate regressions; browser feel checks remain necessary before claiming visual improvement.

## Update verification

Implementation and follow-up verification: all ten recommendations plus the demo-drawer and onboarding-hatch opportunities were implemented. On 2026-11-15, `npm test` passed 63 tests and `npm run build` succeeded. Browser checks are recorded in `qa/game-expansion-verification.md`; reduced-motion preference emulation was unavailable in the browser QA controls.

Fetched `atharvahuja13/Sustain-a-pet` main and fast-forwarded from `4c42d5a` to `102760d`. Preserved local botanical work, resolved README and PetModel conflicts, retained the new gait phase initialization alongside the botanical renderer. Pushed the upstream commit to `ripjkgaming/Sustain-a-pet` main; remote SHA verified. Existing local work remains uncommitted. A tracked-work backup remains in stash with label `codex-preserve-local-work-before-atharvahuja13-update`; original untracked files were left in place.

Before starting the read-only audit: 51 tests passed in 4 files; production build passed with a bundle-size warning; lint completed with warnings and no errors. Diff whitespace check passed. No animation fixes have been implemented during the audit.
