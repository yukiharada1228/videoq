"""Build the owned LP lesson (macOS say, Pillow, ffmpeg; no network/API).

Run: python3 apps/web/scripts/landing-demo/build.py
The checked-in MP4s are narrated teaching samples, not recordings of AI output.
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "public" / "demo"
LESSON = json.loads((HERE / "lesson.json").read_text())
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def label(draw, position, text, size, fill):
    draw.text(position, text, font=ImageFont.truetype(FONT, size), fill=fill)


def clock(seconds):
    milliseconds = round(seconds * 1000)
    return f"00:{milliseconds // 60000:02d}:{milliseconds // 1000 % 60:02d}.{milliseconds % 1000:03d}"


OUT.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="videoq-lesson-") as work:
    tmp = Path(work)
    for lang in ("ja", "en"):
        lesson = LESSON[lang]
        cues = ["WEBVTT\n"]
        segments = []
        for index, chapter in enumerate(lesson["chapters"]):
            prefix = tmp / f"{lang}-{index}"
            slide = Image.new("RGB", (960, 540), "#1b333f")
            d = ImageDraw.Draw(slide)
            label(d, (46, 30), "VideoQ  /  ORIGINAL LESSON", 19, "#c5ee90")
            label(d, (46, 80), lesson["title"], 24, "#bacbd2")
            label(d, (46, 135), chapter["title"], 42, "white")
            for step, text in enumerate(lesson["steps"]):
                x = 46 + step * 296
                d.rounded_rectangle((x, 223, x + 270, 315), 12, fill="#c5ee90" if step == index else "#2b4653")
                label(d, (x + 20, 245), f"0{step + 1}  {text}", 29, "#20372c" if step == index else "#eef2eb")
            label(d, (46, 352), chapter["line1"], 30, "white")
            label(d, (46, 404), chapter["line2"], 28, "#bacbd2")
            label(d, (46, 492), f"CHAPTER 0{index + 1} / 03", 17, "#c5ee90")
            slide.save(prefix.with_suffix(".png"))
            if index == 1:
                slide.save(OUT / f"explain-{lang}-poster.webp", quality=85)
            prefix.with_suffix(".txt").write_text(chapter["narration"])
            run("say", "-v", lesson["voice"], "-r", str(lesson["rate"]), "-f", str(prefix.with_suffix(".txt")), "-o", str(prefix.with_suffix(".aiff")))
            duration = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(prefix.with_suffix(".aiff"))]))
            if duration > LESSON["chapterSeconds"] - 0.5:
                raise ValueError(f"{lang} chapter {index}: narration {duration:.1f}s exceeds chapter; increase voice rate")
            run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-framerate", "12", "-i", str(prefix.with_suffix(".png")), "-i", str(prefix.with_suffix(".aiff")), "-t", str(LESSON["chapterSeconds"]), "-vf", "format=yuv420p", "-af", "apad", "-c:v", "libx264", "-preset", "slow", "-tune", "stillimage", "-crf", "25", "-c:a", "aac", "-b:a", "64k", "-ar", "44100", "-movflags", "+faststart", str(prefix.with_suffix(".mp4")))
            segments.append(f"file '{prefix.with_suffix('.mp4')}'")
            # A complete verbatim transcript is also available next to the player.
            start = index * LESSON["chapterSeconds"]
            sentences = [text for text in re.split(r'(?<=[。.!?])\s*', chapter['narration']) if text]
            offset = 0
            length = sum(map(len, sentences))
            for sentence in sentences:
                end = offset + len(sentence)
                cues.append(f"{clock(start + duration * offset / length)} --> {clock(start + duration * end / length)}\n{sentence}\n")
                offset = end
        concat = tmp / f"{lang}.txt"
        concat.write_text("\n".join(segments))
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", "-movflags", "+faststart", str(OUT / f"explain-{lang}.mp4"))
        (OUT / f"explain-{lang}.vtt").write_text("\n".join(cues))
        assert (OUT / f"explain-{lang}.mp4").stat().st_size < 1024 * 1024, "Keep lessons within the media route's 1 MB bound"
        print(f"{lang}: {(OUT / f'explain-{lang}.mp4').stat().st_size:,} bytes")
