"""Local voiceover + word timings for the GreenLens film.

Reads narration.json, synthesises each line with Kokoro on device (npx hyperframes tts),
loudness-normalises it, transcribes it with local Whisper for word timing and writes
assets/vo/<id>.wav and assets/vo/vo.json ({id: {file, duration, words:[{text,start,end}]}}).
Caption words are the script's words; Whisper supplies their times (matched by position,
falling back to character-proportional timing when the counts differ).

Needs HYPERFRAMES_PYTHON pointing at a python with kokoro-onnx + soundfile.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = json.loads((ROOT / "narration.json").read_text())
vo_dir = ROOT / "assets/vo"
vo_dir.mkdir(parents=True, exist_ok=True)
out = {}


os.environ.setdefault("HYPERFRAMES_PYTHON", "/tmp/claude-1000/-home-ripjk/923d399d-5294-4f32-a761-e8b5d47568fa/scratchpad/ttsvenv/bin/python")


def run(cmd, **kw):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env=os.environ, **kw)
    if r.returncode:
        raise SystemExit(f"{cmd[:3]} failed:\n{r.stdout[-600:]}\n{r.stderr[-600:]}")
    return r


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("&", "and"))


def merged(words, heard):
    """Give each script word the time of the ASR tokens that spell it (hyphenated or spaced names span several)."""
    out, j = [], 0
    for w in words:
        target, got, start = norm(w), "", None
        while j < len(heard) and len(got) < len(target):
            if got and len(got) + len(norm(heard[j]["text"])) > len(target) + 2:
                break  # ASR dropped a letter ("connect" for "connects"): don't eat the next word
            if start is None:
                start = heard[j]["start"]
            got += norm(heard[j]["text"])
            end = heard[j]["end"]
            j += 1
        if start is None:
            return None
        out.append({"text": w, "start": round(start, 3), "end": round(end, 3)})
    return out if j >= len(heard) - 1 else None


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout)


for line in spec["lines"]:
    lid = line["id"]
    raw = vo_dir / f"{lid}.raw.wav"
    wav = vo_dir / f"{lid}.wav"
    spoken = line.get("spoken", line["text"])
    only = os.environ.get("ONLY", "")
    if not os.environ.get("ALIGN_ONLY") and (not only or lid in only.split(",")):
        run(["npx", "hyperframes", "tts", spoken, "-v", spec["voice"], "-s", str(spec["speed"]), "-o", str(raw), "--json"])
        # trim edges, normalise to -16 LUFS, true peak -1.5 dBTP, 48 kHz mono
        run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af",
             "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
             "loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000", "-ac", "1", str(wav)])
        raw.unlink()
    tpath = vo_dir / "transcript.json"
    tpath.unlink(missing_ok=True)
    run(["npx", "hyperframes", "transcribe", str(wav), "--engine", "parakeet", "--json"])
    heard = json.loads(tpath.read_text()) if tpath.exists() else []
    if isinstance(heard, dict):
        heard = heard.get("words", [])
    heard = [w for w in heard if re.search(r"[A-Za-z0-9]", w.get("text", ""))]
    words = line["text"].split()
    dur = duration(wav)
    timed = merged(words, heard)
    how = "asr"
    if timed is None:
        total = sum(len(w) + 1 for w in words)
        t, timed = 0.0, []
        for w in words:
            span = dur * (len(w) + 1) / total
            timed.append({"text": w, "start": round(t, 3), "end": round(t + span * 0.92, 3)})
            t += span
        how = f"proportional (whisper heard {len(heard)} words, script has {len(words)})"
    out[lid] = {"file": f"assets/vo/{lid}.wav", "scene": line["scene"], "at": line["at"], "duration": round(dur, 3),
                "text": line["text"], "timing": how, "words": timed}
    print(f"{lid}: {dur:.2f}s  {how}")

if (ROOT / "assets/transcript.json").exists():
    shutil.move(ROOT / "assets/transcript.json", vo_dir / "last-transcript.json")
(vo_dir / "vo.json").write_text(json.dumps(out, indent=2))
