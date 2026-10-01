"""Build five original, narrated study lessons with local macOS speech.

No downloaded course material. These MP4s go through VideoQ's normal upload,
transcription and indexing pipeline before the product demo is captured.
"""
import json
import math
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "lessons"
COURSE = json.loads((ROOT / "content" / "course.json").read_text())
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"

def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)

def text(draw, x, y, value, size, color="#203542"):
    draw.text((x, y), value, font=ImageFont.truetype(FONT, size), fill=color)

OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="videoq-campus-lessons-") as work:
    tmp = Path(work)
    manifest = []
    for lesson in COURSE["lessons"]:
        segments, chapters, offset = [], [], 0
        for index, chapter in enumerate(lesson["chapters"]):
            stem = tmp / f'{lesson["key"]}-{index}'
            slide = Image.new("RGB", (1280, 720), "#f8faf7")
            draw = ImageDraw.Draw(slide)
            draw.rounded_rectangle((40, 38, 1240, 681), radius=28, fill="white", outline="#dde5e0", width=2)
            draw.rounded_rectangle((82, 75, 192, 120), radius=12, fill=lesson["color"])
            text(draw, 104, 80, lesson["subject"], 26)
            text(draw, 220, 83, "大学生のための5教科・基礎教養", 25, "#697a80")
            text(draw, 82, 168, chapter["title"], 48)
            for j, line in enumerate(chapter["lines"]):
                draw.rounded_rectangle((82, 287 + j*108, 1198, 375 + j*108), radius=16, fill=lesson["color"] if j == 0 else "#f3f6f7")
                text(draw, 112, 308 + j*108, line, 34)
            text(draw, 84, 578, f'VideoQ ORIGINAL LESSON    /    {index+1:02d} — 03', 22, "#6c7c80")
            for j in range(3):
                draw.rounded_rectangle((84+j*372, 635, 430+j*372, 641), radius=3, fill="#3454bd" if j <= index else "#e8edee")
            slide.save(stem.with_suffix(".png"))
            if index == 0:
                slide.save(OUT / f'{lesson["key"]}-poster.webp', quality=90)
            stem.with_suffix(".txt").write_text(chapter["narration"])
            run("say", "-v", "Kyoko", "-r", "265", "-f", str(stem.with_suffix(".txt")), "-o", str(stem.with_suffix(".aiff")))
            duration = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(stem.with_suffix(".aiff"))]))
            seconds = max(20, math.ceil(duration + 1))
            chapters.append({"title": chapter["title"], "start": offset, "end": offset+seconds})
            offset += seconds
            run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "15", "-i", str(stem.with_suffix(".png")), "-i", str(stem.with_suffix(".aiff")), "-t", str(seconds), "-vf", "format=yuv420p", "-af", "apad", "-c:v", "libx264", "-preset", "fast", "-tune", "stillimage", "-crf", "24", "-c:a", "aac", "-b:a", "80k", "-ar", "44100", "-movflags", "+faststart", str(stem.with_suffix(".mp4")))
            segments.append(f"file '{stem.with_suffix('.mp4')}'")
        concat = tmp / f'{lesson["key"]}.txt'
        concat.write_text("\n".join(segments))
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(OUT / f'{lesson["key"]}.mp4'))
        manifest.append({"key": lesson["key"], "duration": offset, "chapters": chapters})
        print(f'{lesson["title"]}: {offset}s', flush=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
