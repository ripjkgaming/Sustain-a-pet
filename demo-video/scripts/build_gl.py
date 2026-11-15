"""Build the GreenLens film's generated parts from film.json + assets/vo/vo.json + assets/footage/timing.json.

Writes:
  index.html                 root: ground, scene hosts, voiceover + sfx audio
  compositions/stage.html    3D phone (supplied GLB) with the real screen recordings pinned to its display
  compositions/captions.html live subtitles, word-highlighted, from measured voice timings
Hand-written motion-graphics scenes live in compositions/mg-*.html and are not touched.
Run: python3 scripts/build_gl.py
"""
import json
import re
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
film = json.loads((ROOT / "film.json").read_text())
vo = json.loads((ROOT / "assets/vo/vo.json").read_text())
timing = json.loads((ROOT / "assets/footage/timing.json").read_text())["segments"]
DUR = film["duration"]
r3 = lambda x: f"{x:.3f}".rstrip("0").rstrip(".")

# ---------------------------------------------------------------- stage
videos, taps, labels = [], [], []
for i, s in enumerate(film["screen"]):
    rate = s.get("rate", 1)
    d = s["end"] - s["start"]
    seg = timing[s["clip"]]
    vid = f"sc{i:02d}"
    rate_attr = f' data-playback-rate="{rate}"' if rate != 1 else ""
    videos.append(f'      <video id="{vid}" class="clip shot" data-start="{r3(s["start"])}" data-duration="{r3(d)}" data-media-start="{r3(s["ms"])}"{rate_attr} data-track-index="2" src="{seg["file"]}" muted playsinline></video>')
    for t in seg["taps"]:
        g = s["start"] + (t["t"] - s["ms"]) / rate
        if s["start"] <= g < s["end"] - 0.1:
            taps.append((g, t["x"], t["y"]))
    if s.get("label"):
        labels.append((s["start"], d, s["label"]))
taps.sort()
tap_html, last = [], -9
for n, (g, x, y) in enumerate(taps):
    if g - last < 0.35:
        continue
    last = g
    tap_html.append(f'      <div id="tap{n:02d}" class="clip tap" data-start="{r3(max(0, g - 0.08))}" data-duration="0.6" data-track-index="3" style="left:{x - 30:.1f}px;top:{y - 30:.1f}px"><i></i></div>')
label_html = [
    f'    <div id="note{n:02d}" class="clip note" data-start="{r3(s + 0.1)}" data-duration="{r3(max(d - 0.2, 2.1))}" data-track-index="4"><span><b>⏩</b>{escape(text)}</span></div>'
    for n, (s, d, text) in enumerate(labels)]

stage = f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; }}
    #stage-canvas {{ position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }}
    #stage-screen, #stage-glass {{ position: absolute; left: 0; top: 0; width: 440px; height: 956px; transform-origin: 0 0; border-radius: 62px; overflow: hidden; }}
    #stage-screen {{ background: #0a0d0b; }}
    #stage-screen .shot {{ position: absolute; left: 0; top: 0; width: 440px; height: 956px; object-fit: cover; }}
    #stage-island {{ position: absolute; left: 157px; top: 13px; width: 126px; height: 37px; border-radius: 20px; background: #050505; z-index: 6; }}
    #stage-glass {{ pointer-events: none; background: linear-gradient(115deg, rgba(255,255,255,0) calc(var(--sheen, 40%) - 18%), rgba(255,255,255,.13) var(--sheen, 40%), rgba(255,255,255,0) calc(var(--sheen, 40%) + 14%)); }}
    .tap {{ position: absolute; width: 60px; height: 60px; z-index: 5; }}
    .tap i {{ position: absolute; inset: 0; border-radius: 50%; background: rgba(255,255,255,.55); border: 3px solid rgba(15,58,34,.55); box-shadow: 0 4px 14px rgba(15,58,34,.25); }}
    .note {{ position: absolute; left: 0; right: 0; top: 64px; text-align: center; z-index: 8; }}
    .note span {{ display: inline-block; font: 800 28px/1 Nunito, sans-serif; color: #0f3a22; background: rgba(255,255,255,.92); padding: 13px 22px; border-radius: 999px; box-shadow: 0 6px 24px rgba(15,58,34,.14); letter-spacing: .01em; }}
    .note b {{ font-weight: 800; margin-right: 10px; color: #2f8a43; }}
  </style>
  <div id="root" data-composition-id="stage" data-width="1920" data-height="1080" data-layout-allow-overlap data-layout-allow-overflow>
    <canvas id="stage-canvas" width="1920" height="1080"></canvas>
    <div id="stage-screen">
{chr(10).join(videos)}
{chr(10).join(tap_html)}
      <div id="stage-island"></div>
    </div>
    <div id="stage-glass"></div>
{chr(10).join(label_html)}
  </div>
  <script>
    (function () {{
      const KEYS = {json.dumps(film["pose"])};
      const st = PhoneStage.mount({{
        canvas: document.getElementById('stage-canvas'),
        screen: document.getElementById('stage-screen'),
        glass: document.getElementById('stage-glass'),
        glb: 'assets/phone/supplied-iphone.glb',
        keys: KEYS,
      }});
      window.__hf = window.__hf || {{}};
      window.__hf.buildReady = window.__hf.buildReady || {{}};
      const tl = gsap.timeline({{ paused: true }});
      document.querySelectorAll('#stage-screen .tap i').forEach((el) => {{
        const t = parseFloat(el.parentElement.dataset.start);
        tl.fromTo(el, {{ scale: 0.55, opacity: 0 }}, {{ scale: 0.8, opacity: 1, duration: 0.1, ease: 'power2.out' }}, t);
        tl.to(el, {{ scale: 1.25, opacity: 0, duration: 0.4, ease: 'power2.out' }}, t + 0.16);
      }});
      document.querySelectorAll('.note span').forEach((el) => {{
        const host = el.parentElement, t = parseFloat(host.dataset.start), d = parseFloat(host.dataset.duration);
        tl.fromTo(el, {{ y: -16, opacity: 0, filter: 'blur(6px)' }}, {{ y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'expo.out' }}, t);
        tl.to(el, {{ opacity: 0, filter: 'blur(4px)', duration: 0.15, ease: 'power2.in' }}, t + d - 0.17);
      }});
      tl.set({{}}, {{}}, {DUR});
      tl.eventCallback('onUpdate', () => st.render(tl.time()));
      window.addEventListener('hf-seek', (e) => st.render(e.detail.time));
      window.__hf.buildReady.phone = st.ready.then(() => st.render(0));
      window.__timelines['stage'] = tl;
    }})();
  </script>
</template>
"""
(ROOT / "compositions").mkdir(exist_ok=True)
(ROOT / "compositions/stage.html").write_text(stage)

# ---------------------------------------------------------------- captions
groups = []
for item in film["vo"]:
    words = vo[item["id"]]["words"]
    cur = []
    for k, w in enumerate(words):
        cur.append(w)
        gap = words[k + 1]["start"] - w["end"] if k + 1 < len(words) else 9
        if len(cur) >= 6 or re.search(r"[.?!:]$", w["text"]) or (re.search(r",$", w["text"]) and len(cur) >= 3) or gap > 0.3 or k == len(words) - 1:
            groups.append((item["at"], cur))
            cur = []
cap_html = []
for n, (at, ws) in enumerate(groups):
    s = at + ws[0]["start"] - 0.05
    e = at + ws[-1]["end"] + 0.18
    if n + 1 < len(groups):
        nat, nws = groups[n + 1]
        e = min(e, nat + nws[0]["start"] - 0.06)
    inner = " ".join(f'<span class="w" data-t="{r3(at + w["start"])}">{escape(w["text"])}</span>' for w in ws)
    cap_html.append(f'    <div id="cap{n:03d}" class="clip cap" data-start="{r3(s)}" data-duration="{r3(e - s)}" data-track-index="1"><p>{inner}</p></div>')

captions = f"""<template>
  <style>
    #root {{ position: absolute; inset: 0; }}
    .cap {{ position: absolute; left: 0; right: 0; bottom: 74px; text-align: center; }}
    .cap p {{ display: inline-block; margin: 0; max-width: 1360px; padding: 14px 28px 16px; border-radius: 22px; background: rgba(12, 38, 24, .8); font: 800 40px/1.25 Nunito, sans-serif; letter-spacing: .005em; color: rgba(255,255,255,.6); }}
    .cap .w {{ display: inline-block; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1920" data-height="1080">
{chr(10).join(cap_html)}
  </div>
  <script>
    (function () {{
      const tl = gsap.timeline({{ paused: true }});
      document.querySelectorAll('.cap').forEach((cap) => {{
        const s = parseFloat(cap.dataset.start), d = parseFloat(cap.dataset.duration);
        const p = cap.querySelector('p');
        tl.fromTo(p, {{ opacity: 0, y: 10 }}, {{ opacity: 1, y: 0, duration: 0.14, ease: 'power3.out' }}, s);
        cap.querySelectorAll('.w').forEach((w) => {{
          tl.fromTo(w, {{ color: 'rgba(255,255,255,0.6)' }}, {{ color: '#ffffff', duration: 0.08, ease: 'none' }}, parseFloat(w.dataset.t));
        }});
        tl.to(p, {{ opacity: 0, duration: 0.1, ease: 'power2.in' }}, s + d - 0.1);
      }});
      tl.set({{}}, {{}}, {DUR});
      window.__timelines['captions'] = tl;
    }})();
  </script>
</template>
"""
(ROOT / "compositions/captions.html").write_text(captions)

# ---------------------------------------------------------------- root
vo_tags = [
    f'      <audio id="vo-{item["id"]}" class="clip" data-start="{r3(item["at"])}" data-duration="{r3(vo[item["id"]]["duration"])}" data-track-index="10" src="{vo[item["id"]]["file"]}" data-volume="1"></audio>'
    for item in film["vo"]]
sfx = json.loads((ROOT / "sfx.json").read_text()) if (ROOT / "sfx.json").exists() else []
sfx_tags = [
    f'      <audio id="sfx-{n:02d}" class="clip" data-start="{r3(s["at"])}" data-duration="{r3(s.get("dur", 1.2))}" data-track-index="11" src="assets/sfx/{s["file"]}" data-volume="{s.get("vol", 0.35)}"></audio>'
    for n, s in enumerate(sfx)]
hosts = [
    f'      <div id="mg-{sc["id"]}" data-composition-id="mg-{sc["id"]}" data-composition-src="compositions/mg-{sc["id"]}.html" data-start="{r3(sc["start"])}" data-duration="{r3(sc["end"] - sc["start"])}" data-track-index="5" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:4"></div>'
    for sc in film["scenes"]]

index = f"""<!doctype html>
<html lang="en" data-composition-variables='[{{"id":"siteUrl","type":"string","label":"Public URL","default":"sustain-a-pet.deployxa.online"}},{{"id":"brand","type":"string","label":"Product name","default":"Sustain-a-Pet"}}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="lib/gsap.min.js"></script>
    <script src="lib/three-kit.js"></script>
    <script src="lib/phone-stage.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: #e6eee0; }}
      #ground {{ position: absolute; inset: 0; background: radial-gradient(120% 90% at 62% 38%, #f4f8ef 0%, #e3ecdc 55%, #d2e0c8 100%); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{DUR}" data-width="1920" data-height="1080">
      <div id="ground"></div>
      <div id="stage" data-composition-id="stage" data-composition-src="compositions/stage.html" data-start="0" data-duration="{DUR}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:3"></div>
{chr(10).join(hosts)}
      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" data-start="0" data-duration="{DUR}" data-track-index="6" data-track-kind="captions" data-width="1920" data-height="1080" style="z-index:9"></div>
{chr(10).join(vo_tags)}
{chr(10).join(sfx_tags)}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
(ROOT / "index.html").write_text(index)
print(f"stage: {len(videos)} shots, {len(tap_html)} taps, {len(label_html)} notes; captions: {len(groups)} groups; vo: {len(vo_tags)}; sfx: {len(sfx_tags)}")
