# Sustain-a-Pet demo specification

GOAL: Show that small completed real-life habits care for a companion and fund a garden the player can restore and explore.
OUTPUT: HyperFrames; 1920 × 1080; 30 fps; MP4 H.264; editable HTML scenes and capture scripts.
TIME: Exactly 120.000 seconds = 3,600 frames, exclusive endpoint 120.
LOOK: #e1ebd7 studio ground, #203f30 ink, #ce9b4c accent limited to one title word or rule. Nunito 700 display 72–88 px; Inter 400/700 supporting text 30–36 px. Actual app footage retains its own colours and labels. No synthetic screenshots. Main gameplay is at least 900 px high; full landscape footage occupies the frame where needed to read the journal.
OBJECTS: Only the supplied iphone_17_pro_max.usdz phone. Convert through Blender MCP in an isolated temporary scene and restore the game's scene afterward. No load, sampling, copying or processing of glasshouse_interior_2k.exr. Area lights and a flat studio world only. Real recorded gameplay composited onto the measured screen surface; no made-up interface.
MOTION: One 36-frame opening camera move; front-facing screen during readable gameplay. 18-frame power3.inOut push into gameplay; 10–18-frame source-driven cuts and crop moves. Text lands within 12 frames, then holds still. No decorative perpetual drift.
SOUND: No voiceover or subtitle transcript. Prefer app leaf audio at visible walking actions; no synthetic chimes. HeyGen catalog unavailable at initial inspection, so no catalog dependency. Measure final mix and disclose whether heard.

## Planned shots, gated on actual working behavior

| Frames | Seconds | Actual action and framing | Text and handoff |
|---|---|---|---|
| 0–239 | 0–8 | Supplied phone, actual garden footage; front screen becomes dominant | Sustain-a-Pet, held 2–7 s; push to gameplay |
| 240–659 | 8–22 | Establish garden, walk pet to a real habit mushroom, show readable task | Small habits. A living garden. 8–13 s; task opens next beat |
| 660–1139 | 22–38 | Complete actual habit and show reward, then actual daily gift claim | Habit and reward labels come from app |
| 1140–1559 | 38–52 | Actual shop purchase and visible decoration or care result | No unsupported benefit claim |
| 1560–1979 | 52–66 | Actual companion adoption and active companion switch | Actual pet names from app |
| 1980–2459 | 66–82 | Actual restoration purchase and visible world result | Source restoration name, if needed |
| 2460–3089 | 82–103 | Actual unlock and visit to working new maps | If time skips used, hold “Demo mode · simulated days” throughout affected section |
| 3090–3419 | 103–114 | Return to a readable garden with a companion; show continuity | Minimal text; real result carries the claim |
| 3420–3599 | 114–120 | Return to supplied phone with real garden still playing; brand close | Sustain-a-Pet. Held 116–119.967 s |

The slot allocation may change after final gameplay verification. Any unavailable feature is replaced by another verified interaction and this spec is updated before rendering. Do not create or imply missing features.

BANNED: Stock/CSS phone substitutes; supplied EXR; invented UI/features; unlabelled accelerated progression; narration; subtitle captions; navy void; glow/bloom overlays; purple gradients; fake particles; card grids; text over dimmed gameplay; tiny unreadable game window; permanently corner-docked logo; static screenshot pans presented as gameplay; meaningless orbit while text must be read.
QA: Frames 0, 60, 239/240, every action before/after, each scene midpoint, every cut ±6 frames, 3420 and 3599. Check phone material/screen mapping, labels ≥28px when intended to read, true reward changes, real map identity, simulation disclosure, no missing media, no black ends. ffprobe must report 1920×1080, 30fps, 120.000s, 3600 frames. Review decoded final frames and measure audio.
