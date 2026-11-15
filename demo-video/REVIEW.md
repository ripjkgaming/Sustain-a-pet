# GreenLens demo film: review

Output: `renders/sustain-a-pet-greenlens.mp4`, 1920×1080, 30 fps, 160 s (2:40).

## What is real

- Every phone-screen shot is a real recording of the running app (Chrome screencast, 440×956 viewport). Taps are drawn where the recorded taps happened.
- GreenLens results are live OpenRouter responses recorded on 2026-11-15: the jar quest ("Reuse the sauce jar"), the clarifying question ("What object from your kitchen drawer is shown in the photo?") and the battery quest with the Recycling Council of Ontario link. The cards in the film repeat that text word for word.
- The failure demo ran the same build on a separate local server with an invalid OpenRouter key. The labelled "Prerecorded tip, not a live AI result" appears as shown. The film labels this as a failure demo on a test server.
- The shipped-proof scene was recorded on the public site, https://sustain-a-pet.deployxa.online, in fresh browser contexts (desktop and phone). The reload test kept ◉ 90 and 1 leaf.
- The phone is the supplied iPhone 17 Pro Max model (`assets/phone/supplied-iphone.glb`), rendered with Three.js. The recording is pinned to its display with a projective transform.

## What is not real footage

- Real-world beats use motion graphics, as requested: the empty jar (hook) and the jar filled with rice (the real-life action). The second one is labelled "In real life · illustrated".
- Waiting and typing were shortened. Each shortened stretch carries an on-screen note ("Live model call · wait shortened", "Typing sped up"). The first live call took about 20 s.

## Known gaps

- The public deployment currently has no `OPENROUTER_API_KEY` (`/readyz` reports it missing), so GreenLens there returns `ai_unconfigured`. The live-AI scenes were recorded against a local production build of the same code.
- No music bed: no licensed music source was available locally. Sound is narration plus a few effects.
- Voice: Kokoro-82M (af_heart), on device. Word timings for captions come from local Parakeet ASR.
- The audio levels were measured but not listened to.

## Edit it

- Narration text: `narration.json`, then `python3 scripts/make_vo.py` (needs `HYPERFRAMES_PYTHON` with kokoro-onnx).
- Cut list, phone moves and VO placement: `film.json`, then `python3 scripts/build_gl.py`.
- Motion graphics: `compositions/mg-*.html`. URL and name are variables on `index.html` (`siteUrl`, `brand`).
- Re-record footage: start preview servers on 5180 (real key) and 5181 (invalid key), then `node scripts/capture_greenlens.mjs` and `python3 scripts/encode_captures.py`.
