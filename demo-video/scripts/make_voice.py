#!/usr/bin/env python3
"""Generate Piper narration, frame-exact subtitles and their index.html wiring.

One WAV per scene in assets/audio/vo-<scene>.wav. Each caption phrase is
synthesised separately, trimmed to its voiced samples and placed on an exact
30 fps frame boundary (22050 Hz / 30 = 735 samples per frame), so every
caption in-point equals the spoken onset of its phrase.

Outputs:
  assets/audio/vo-<scene>.wav      narration, one file per scene
  assets/audio/voiceover.json      measured timing (scene, phrase onset/end)
  compositions/captions.html       single caption sub-composition (inline TRANSCRIPT)
  index.html                       block between <!-- voiceover:start/end --> markers

Re-run after build_film.py regenerates index.html: the marker block is
re-inserted idempotently and no other line of index.html is touched.

Narration describes only what the recorded gameplay shows (see
../qa/game-expansion-verification.md). Do not add claims about how assets were made.
"""
from __future__ import annotations

import html
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
PIPER = "/home/ripjk/.local/bin/piper"
VOICE = "/home/ripjk/.local/share/piper-voices/en_US-lessac-medium.onnx"
FPS = 30
SR = 22050
SPF = SR // FPS  # samples per frame (735)
AUDIO_DIR = ROOT / "assets" / "audio"
TOTAL = 120.0
END_GUARD = 0.30  # narration ends at least this long before its scene cut
GAP = 0.20  # minimum silence between phrases inside a scene
TAIL_HOLD = 0.45
TARGET_RMS_DB = -17.5  # voiced RMS per phrase, dBFS
PEAK_CEIL_DB = -1.5  # sample-peak ceiling per phrase, dBFS  # caption hold after the last phrase of a scene

# (scene id, lead-in seconds after scene start, [(spoken text, caption text), ...])
# Spoken text may respell for Piper; caption text is what is shown.
NARRATION = [
    ("opening", 1.0, [
        ("This is Sustain a Pet.", "This is Sustain-a-Pet."),
        ("Small, real-life habits care for a companion, and help a garden grow.",
         "Small, real-life habits care for a companion, and help a garden grow."),
    ]),
    ("daily-gift", 0.4, [
        ("Each day starts with a gift.", "Each day starts with a gift."),
        ("Collect today's coins and a leaf.", "Collect today’s coins and a leaf."),
    ]),
    ("garden-walk", 0.4, [
        ("Tap a mushroom, and your companion walks over to it.",
         "Tap a mushroom, and your companion walks over to it."),
    ]),
    ("first-habit", 0.4, [
        ("The Today list holds real habits,", "The Today list holds real habits,"),
        ("like a meat-free meal, or a short shower.", "like a meat-free meal or a short shower."),
        ("Tick one off once it's done.", "Tick one off once it’s done."),
    ]),
    ("daily-quiz", 0.4, [
        ("A daily quiz adds a little learning.", "A daily quiz adds a little learning."),
    ]),
    ("habit-rewards", 0.3, [
        ("Habits earn coins and leaves.", "Habits earn coins and leaves."),
        ("Quests add a little extra.", "Quests add a little extra."),
    ]),
    ("garden-shop", 0.3, [
        ("Spend them in the shop,", "Spend them in the shop,"),
    ]),
    ("care-supplies", 0.2, [
        ("on care like morning dew, or leaf compost.", "on care like morning dew or leaf compost."),
    ]),
    ("new-friend", 0.4, [
        ("Coins can also adopt new friends.", "Coins can also adopt new friends."),
    ]),
    ("mossy", 0.4, [
        ("Meet Mossy.", "Meet Mossy."),
        ("Each friend grows at its own pace,", "Each friend grows at its own pace,"),
        ("while habits count for the whole garden.", "while habits count for the whole garden."),
    ]),
    ("meadow-restored", 0.4, [
        ("Restorations bring the garden back to life,", "Restorations bring the garden back to life,"),
        ("starting with the meadow's flower bed.", "starting with the meadow’s flower bed."),
    ]),
    ("next-day", 0.4, [
        ("Demo mode skips ahead a day, to show progress over time.",
         "Demo mode skips ahead a day to show progress over time."),
        ("Your real pet is never touched.", "Your real pet is never touched."),
    ]),
    ("willow-pond", 0.4, [
        ("With the meadow restored, Willow Pond opens up.",
         "With the meadow restored, Willow Pond opens up."),
    ]),
    ("footbridge", 0.4, [
        ("Mend the footbridge, to connect its banks.", "Mend the footbridge to connect its banks."),
    ]),
    ("amber-grove", 0.4, [
        ("Next, Amber Grove unlocks.", "Next, Amber Grove unlocks."),
        ("A golden woodland clearing.", "A golden woodland clearing."),
    ]),
    ("wishing-tree", 0.4, [
        ("There, you can nurture a wishing tree.", "There, you can nurture a wishing tree."),
    ]),
    ("closing", 0.9, [
        ("Small habits, every day.", "Small habits, every day."),
        ("Grow greener, together, with Sustain a Pet.", "Grow greener, together, with Sustain-a-Pet."),
    ]),
]

# Caption zones per scene layout: never over the gameplay / phone screen,
# always inside the 80% title-safe box (x 192..1728, y 108..972).
ZONES = {
    # left column under the scene title, beside the phone / portrait footage
    "phone": {"left": 192, "top": 640, "width": 600, "size": 34},
    "portrait": {"left": 192, "top": 620, "width": 600, "size": 34},
    # top band right of the scene title, above the landscape detail footage
    "detail": {"left": 1040, "top": 120, "width": 652, "size": 30},
}


def frame_ceil(t: float) -> int:
    return int(np.ceil(t * FPS - 1e-9))


def synth(text: str, length_scale: float) -> np.ndarray:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "p.wav"
        subprocess.run(
            [PIPER, "-m", VOICE, "-f", str(out), "--length-scale", f"{length_scale:.3f}",
             "--noise-scale", "0.5", "--noise-w-scale", "0.6"],
            input=text.encode(), check=True, capture_output=True,
        )
        with wave.open(str(out)) as w:
            assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return trim(pcm)


def trim(pcm: np.ndarray) -> np.ndarray:
    """Cut leading/trailing silence using a 10 ms RMS window at -45 dBFS."""
    win = SR // 100
    n = len(pcm) // win
    rms = np.sqrt(np.mean((pcm[: n * win].astype(np.float64) / 32768.0).reshape(n, win) ** 2, axis=1))
    voiced = np.where(rms > 10 ** (-45 / 20))[0]
    if len(voiced) == 0:
        raise SystemExit("piper produced silence")
    a = max(0, voiced[0] * win - SR // 200)  # keep 5 ms before onset
    b = min(len(pcm), (voiced[-1] + 1) * win + SR // 50)  # keep 20 ms tail
    seg = pcm[a:b].astype(np.float64)
    fade = min(len(seg) // 2, SR // 200)
    seg[:fade] *= np.linspace(0, 1, fade)
    seg[-fade:] *= np.linspace(1, 0, fade)
    # level match: voiced RMS to TARGET_RMS_DB, never above PEAK_CEIL_DB
    lo, hi = voiced[0] * win, (voiced[-1] + 1) * win
    rms_v = np.sqrt(np.mean((pcm[lo:hi].astype(np.float64) / 32768.0) ** 2))
    gain = min(10 ** (TARGET_RMS_DB / 20) / rms_v, 10 ** (PEAK_CEIL_DB / 20) * 32767 / np.max(np.abs(seg)))
    return np.round(seg * gain).astype(np.int16)


def build_scene(scene: dict, lead: float, phrases: list, length_scale: float):
    start_frame = frame_ceil(scene["start"] + lead)
    clips = [synth(spoken, length_scale) for spoken, _ in phrases]
    buf: list[np.ndarray] = []
    pos = 0  # samples from scene audio start (frame aligned)
    timing = []
    for i, (clip, (_, shown)) in enumerate(zip(clips, phrases)):
        if i:
            onset = pos + int(GAP * SR)
            onset = -(-onset // SPF) * SPF  # snap phrase onset up to a frame boundary
            buf.append(np.zeros(onset - pos, dtype=np.int16))
            pos = onset
        timing.append({"text": shown, "onset_samples": pos, "end_samples": pos + len(clip)})
        buf.append(clip)
        pos += len(clip)
    total = -(-pos // SPF) * SPF  # pad file to whole frames
    buf.append(np.zeros(total - pos, dtype=np.int16))
    return start_frame, np.concatenate(buf), timing


def main() -> None:
    shots = {s["id"]: s for s in json.loads((ROOT / "shots.json").read_text())["shots"]}
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    report = {"fps": FPS, "sample_rate": SR, "voice": Path(VOICE).name, "scenes": []}
    groups = []
    audio_tags = []
    for sid, lead, phrases in NARRATION:
        scene = shots[sid]
        scene_end = scene["start"] + scene["duration"]
        for ls in (1.0, 0.95, 0.9, 0.85):
            start_frame, pcm, timing = build_scene(scene, lead, phrases, ls)
            end_t = start_frame / FPS + len(pcm) / SR
            if end_t <= scene_end - END_GUARD + 1e-9:
                break
        else:
            raise SystemExit(f"{sid}: narration does not fit ({end_t:.2f}s > {scene_end - END_GUARD:.2f}s)")
        path = AUDIO_DIR / f"vo-{sid}.wav"
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        frames = len(pcm) // SPF
        start_s = start_frame / FPS
        audio_tags.append(
            f'<audio id="vo-{sid}" data-start="{secs(start_frame)}" data-duration="{secs(frames)}" '
            f'data-media-start="0" data-track-index="6" src="assets/audio/vo-{sid}.wav" data-volume="1"></audio>'
        )
        entries = []
        for i, t in enumerate(timing):
            in_f = start_frame + t["onset_samples"] // SPF
            spoken_end = start_s + t["end_samples"] / SR
            if i + 1 < len(timing):
                out_f = start_frame + timing[i + 1]["onset_samples"] // SPF
            else:
                out_f = min(frame_ceil(spoken_end + TAIL_HOLD), round(scene_end * FPS))
            groups.append({"text": t["text"], "start": float(secs(in_f)), "end": float(secs(out_f)),
                           "in_frame": in_f, "out_frame": out_f, "zone": scene["layout"]})
            entries.append({"text": t["text"], "in_frame": in_f, "out_frame": out_f,
                            "spoken_start": round(in_f / FPS, 4), "spoken_end": round(spoken_end, 4)})
        report["scenes"].append({"id": sid, "audio": f"assets/audio/vo-{sid}.wav", "length_scale": ls,
                                 "start_frame": start_frame, "frames": frames,
                                 "end": round(start_s + len(pcm) / SR, 4), "scene_end": scene_end,
                                 "phrases": entries})
        print(f"{sid:16s} {start_s:7.3f}-{start_s + len(pcm) / SR:7.3f}s  ls={ls}  ({len(timing)} phrases)")
    (AUDIO_DIR / "voiceover.json").write_text(json.dumps(report, indent=2) + "\n")
    write_captions(groups)
    wire_index(audio_tags)


def secs(frames: int) -> str:
    return f"{frames / FPS:.4f}".rstrip("0").rstrip(".")


def write_captions(groups: list) -> None:
    transcript = [{"text": g["text"], "start": g["start"], "end": g["end"], "zone": g["zone"]} for g in groups]
    zone_css = "\n".join(
        f'.cg[data-zone="{k}"]{{left:{v["left"]}px;top:{v["top"]}px;width:{v["width"]}px;max-width:{v["width"]}px;font-size:{v["size"]}px}}'
        for k, v in ZONES.items()
    )
    divs = "\n".join(
        f' <div id="cg-{i}" class="cg" data-zone="{g["zone"]}">{html.escape(g["text"])}</div>'
        for i, g in enumerate(groups)
    )
    doc = f"""<template>
<style>
#captions-root{{position:absolute;inset:0;pointer-events:none}}
.cg{{position:absolute;margin:0;color:#203f30;font-family:Inter,sans-serif;font-weight:600;line-height:1.28;letter-spacing:-.01em;white-space:normal;overflow:visible;opacity:0;visibility:hidden}}
{zone_css}
</style>
<div id="captions-root" data-composition-id="captions" data-width="1920" data-height="1080">
{divs}
</div>
<script>
// Generated by scripts/make_voice.py from the measured Piper narration. Do not hand-edit timing.
var TRANSCRIPT = {json.dumps(transcript, indent=1, ensure_ascii=False)};
var tl = gsap.timeline({{ paused: true }});
TRANSCRIPT.forEach(function (group, gi) {{
  var groupEl = document.getElementById("cg-" + gi);
  // visible on the exact spoken-onset frame, then a short settle (lands within 6 frames)
  tl.set(groupEl, {{ visibility: "visible", opacity: 1 }}, group.start);
  tl.fromTo(groupEl, {{ y: 6 }}, {{ y: 0, duration: 0.2, ease: "power2.out" }}, group.start);
  tl.to(groupEl, {{ opacity: 0, duration: 0.1, ease: "power2.in" }}, group.end - 0.1);
  tl.set(groupEl, {{ opacity: 0, visibility: "hidden" }}, group.end);
}});
window.__timelines = window.__timelines || {{}};
window.__timelines["captions"] = tl;
</script>
</template>
"""
    (ROOT / "compositions" / "captions.html").write_text(doc)


START, END = "<!-- voiceover:start -->", "<!-- voiceover:end -->"


def wire_index(audio_tags: list) -> None:
    index = ROOT / "index.html"
    src = index.read_text()
    host = ('<div id="captions" class="clip" data-composition-id="captions" '
            'data-composition-src="compositions/captions.html" data-start="0" data-duration="120" '
            'data-track-index="5" data-track-kind="captions" data-width="1920" data-height="1080"></div>')
    block = "\n".join([START, host, *audio_tags, END])
    if START in src:
        a = src.index(START)
        b = src.index(END) + len(END)
        src = src[:a] + block + src[b:]
    else:
        anchor = "</div><script>window.__timelines"
        if anchor not in src:
            raise SystemExit("index.html: root close anchor not found")
        src = src.replace(anchor, block + "\n" + anchor, 1)
    index.write_text(src)


if __name__ == "__main__":
    sys.exit(main())
