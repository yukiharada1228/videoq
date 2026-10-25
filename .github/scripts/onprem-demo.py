"""Generate a fictional Japanese demo locally with macOS speech and FFmpeg.

Generated media stays in the operator's output directory, outside the repository.
No API keys, external speech services, or real company information are used.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess


CHAPTERS = [
    ("旅費の申請", "これは架空の研修デモです。旅費の申請は、出張の三営業日前までに総務へ提出します。"),
    ("領収書の管理", "領収書は経費管理システムに登録し、原本は一年間保管します。"),
    ("動画とAIの処理", "機密情報を含む動画は、社内のサーバーだけで処理し、社外へ送信しません。"),
]


def generate(output, voice="Kyoko"):
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    if any((output / name).exists() for name in ("demo.mp4", "case.json")):
        raise ValueError("Use a new directory; existing demo media is never overwritten")
    for binary in ("say", "ffmpeg", "ffprobe", "node"):
        if not shutil.which(binary):
            raise RuntimeError("Required local tool is missing: " + binary)
    def run(command):
        return subprocess.check_output(command, cwd=output, text=True, stderr=subprocess.PIPE).strip()

    def duration(path):
        return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", str(path)]))

    boundaries = []
    cursor = 0.0
    for number, (_, text) in enumerate(CHAPTERS):
        (output / f"chapter-{number}.txt").write_text(text, encoding="utf8")
        run(["say", "-v", voice, "-r", "185", "-f", f"chapter-{number}.txt", "-o", f"chapter-{number}.aiff"])
        run(["ffmpeg", "-v", "error", "-n", "-i", f"chapter-{number}.aiff", "-af", "apad=pad_dur=0.5",
             "-ar", "16000", "-ac", "1", f"chapter-{number}.wav"])
        seconds = duration(f"chapter-{number}.wav")
        boundaries.append({"start": cursor, "end": cursor + seconds, "reference": text})
        cursor += seconds
    (output / "audio-list.txt").write_text("".join(f"file 'chapter-{i}.wav'\n" for i in range(3)))
    run(["ffmpeg", "-v", "error", "-n", "-f", "concat", "-safe", "1", "-i", "audio-list.txt", "-c", "copy", "narration.wav"])
    (output / "title.txt").write_text("架空の社内研修デモ", encoding="utf8")
    (output / "card.txt").write_text("旅費：三営業日前までに総務へ\n\n領収書：システム登録・原本を一年保管\n\n動画・AI：社内で処理、社外へ送信しない\n\n※ 実在の会社や運用ルールではありません", encoding="utf8")
    run(["node", str(Path(__file__).resolve().parents[1] / "onprem-lab/demo-card.mjs"), str(output)])
    run(["ffmpeg", "-v", "error", "-n", "-loop", "1", "-framerate", "10", "-i", "card.png", "-i", "narration.wav",
         "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", "demo.mp4"])
    questions = [
        {"id": "travel", "text": "旅費の申請は、出張の何日前までに、どこへ提出しますか？",
         "expectedAnswer": "出張の三営業日前までに総務へ提出します。", "allTerms": ["営業日", "総務"], "anyTerms": ["三", "3"]},
        {"id": "receipts", "text": "領収書はどこに登録し、原本をどのくらい保管しますか？",
         "expectedAnswer": "経費管理システムに登録し、原本は一年間保管します。", "allTerms": ["経費管理システム"], "anyTerms": ["一年", "1年"]},
        {"id": "privacy", "text": "機密情報を含む動画はどこで処理し、社外へ送信しますか？",
         "expectedAnswer": "社内のサーバーだけで処理し、社外へ送信しません。", "allTerms": ["社内", "社外"], "anyTerms": ["しません", "しない", "せず", "禁止"]},
    ]
    for question, region in zip(questions, boundaries):
        question["citationRange"] = {"start": region["start"], "end": region["end"]}
    case = {"schemaVersion": 1, "name": "fictional-ja-training", "locale": "ja", "file": "demo.mp4", "mediaKind": "video",
            "duration": duration("demo.mp4"), "sha256": hashlib.sha256((output / "demo.mp4").read_bytes()).hexdigest(),
            "reference": "".join(text for _, text in CHAPTERS), "regions": boundaries, "maxCer": 0.25,
            "questions": questions, "generator": {"kind": "macOS local speech", "voice": voice},
            "interpretation": "Synthetic smoke/performance data; not customer-video accuracy or a production capacity SLA"}
    (output / "case.json").write_text(json.dumps(case, ensure_ascii=False, indent=2) + "\n")
    return case


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--voice", default="Kyoko")
    args = parser.parse_args()
    result = generate(args.output, args.voice)
    print(json.dumps({"case": str(args.output.resolve() / "case.json"), "duration": result["duration"], "sha256": result["sha256"]}))
