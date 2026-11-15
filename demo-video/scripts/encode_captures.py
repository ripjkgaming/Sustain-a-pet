"""Encode CDP screencast captures into constant-30fps MP4 clips plus a timing file.

Run after scripts/capture_greenlens.mjs:
    python3 scripts/encode_captures.py [captures/gl-<timestamp>]

Writes assets/footage/<segment>.mp4 and assets/footage/timing.json
(taps and marks in seconds from the clip's first frame, tap x/y in CSS px of the capture viewport).
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if len(sys.argv) > 1:
    capture = Path(sys.argv[1]).resolve()
else:
    capture = Path(json.loads((ROOT / "captures/latest-greenlens.json").read_text())["directory"])
log = json.loads((capture / "capture.json").read_text())
out = ROOT / "assets/footage"
out.mkdir(parents=True, exist_ok=True)
timing = {"source": str(capture.name), "segments": {}}

for seg in log["segments"]:
    sid = seg["id"]
    frames = json.loads((capture / sid / "frames.json").read_text())
    t0 = frames[0]["ts"]
    lines = ["ffconcat version 1.0"]
    for i, f in enumerate(frames):
        nxt = frames[i + 1]["ts"] if i + 1 < len(frames) else f["ts"] + 0.5
        lines.append(f"file '{f['name']}'")
        lines.append(f"duration {max(nxt - f['ts'], 0.001):.6f}")
    lines.append(f"file '{frames[-1]['name']}'")
    concat = capture / sid / "frames.ffconcat"
    concat.write_text("\n".join(lines) + "\n")
    target = out / f"{sid}.mp4"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-safe", "0", "-f", "concat", "-i", str(concat),
        "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
        "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-g", "30", "-movflags", "+faststart", str(target),
    ], check=True)
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(target)],
                               capture_output=True, text=True, check=True).stdout)
    timing["segments"][sid] = {
        "file": f"assets/footage/{sid}.mp4",
        "duration": round(dur, 3),
        "viewport": seg["viewport"],
        "note": seg["note"],
        "taps": [{"t": round(t["t"] - t0, 3), "x": round(t["x"], 1), "y": round(t["y"], 1)} for t in seg["taps"]],
        "marks": [{**{k: v for k, v in m.items() if k != "t"}, "t": round(m["t"] - t0, 3)} for m in seg["marks"]],
    }
    print(f"{sid}: {dur:.2f}s -> {target.relative_to(ROOT)}")

for key in ("jarQuest", "clarifyQuestion", "secondQuest"):
    if key in log:
        timing[key] = log[key]
(out / "timing.json").write_text(json.dumps(timing, indent=2))
