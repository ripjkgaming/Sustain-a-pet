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


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, cwd=ROOT, capture_output=True, text=True, **kw)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).stdout)


for line in spec["lines"]:
    lid = line["id"]
    raw = vo_dir / f"{lid}.raw.wav"
    wav = vo_dir / f"{lid}.wav"
    spoken = line.get("spoken", line["text"])
    run(["npx", "hyperframes", "tts", spoken, "-v", spec["voice"], "-s", str(spec["speed"]), "-o", str(raw), "--json"])
    # trim edges, normalise to -16 LUFS, true peak -1.5 dBTP, 48 kHz mono
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-af",
         "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
         "loudnorm=I=-16:TP=-1.5:LRA=7,aresample=48000", "-ac", "1", str(wav)])
    raw.unlink()
    res = run(["npx", "hyperframes", "transcribe", str(wav), "--model", "small.en", "--json"])
    tpath = ROOT / "assets/transcript.json"
    heard = json.loads(tpath.read_text()) if tpath.exists() else []
    if isinstance(heard, dict):
        heard = heard.get("words", [])
    heard = [w for w in heard if re.search(r"[A-Za-z0-9]", w.get("text", ""))]
    words = line["text"].split()
    dur = duration(wav)
    if len(heard) == len(words):
        timed = [{"text": w, "start": round(h["start"], 3), "end": round(h["end"], 3)} for w, h in zip(words, heard)]
        how = "whisper"
    else:
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
