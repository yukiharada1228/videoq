"""Prepare public FLEURS Japanese fixtures; requires pyarrow only during setup.

Download google/fleurs ja_jp/test/0000.parquet from refs/convert/parquet first.
Dataset: https://huggingface.co/datasets/google/fleurs (CC-BY-4.0).
Serving/benchmarking uses only the resulting local MP3 files and manifest.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave


def write_case(root, name, pcm, reference, regions=None):
    wav = root / f"{name}.wav"
    with wave.open(str(wav), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16000)
        output.writeframes(pcm)
    mp3 = root / f"{name}.mp3"
    subprocess.run(["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", str(wav),
                    "-ar", "16000", "-ac", "1", "-b:a", "64k", str(mp3)], check=True)
    return {"name": name, "file": mp3.name, "duration": len(pcm) / 32000,
            "reference": reference, "regions": regions or [],
            "sha256": hashlib.sha256(mp3.read_bytes()).hexdigest()}


def main():
    import pyarrow.parquet as pq

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("parquet", type=Path)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    root = args.directory
    root.mkdir(parents=True, exist_ok=True)
    rows = pq.read_table(args.parquet).slice(0, 12).to_pylist()
    clips, cases = [], []
    for index, row in enumerate(rows):
        # FFmpeg normalizes the dataset's WAV representation to one PCM format.
        raw = root / "source.wav"
        raw.write_bytes(row["audio"]["bytes"])
        pcm = subprocess.check_output(["ffmpeg", "-nostdin", "-v", "error", "-i", str(raw),
                                       "-ar", "16000", "-ac", "1", "-f", "s16le", "-"])
        raw.unlink()
        clips.append((pcm, row["raw_transcription"]))
        case = write_case(root, f"fleurs-ja-{index:02}", pcm, row["raw_transcription"])
        case["dataset_id"] = row["id"]
        cases.append(case)
    pcm, reference, regions = b"", [], []
    for clip, text in clips[:6]:
        pcm += bytes(3 * 32000)
        start = len(pcm) / 32000
        pcm += clip
        regions.append({"start": start, "end": len(pcm) / 32000, "reference": text})
        reference.append(text)
    cases.append(write_case(root, "japanese-pauses", pcm, " ".join(reference), regions))
    cases.append(write_case(root, "silence", bytes(20 * 32000), ""))

    pcm, reference, regions = b"", [], []
    index = 0
    while len(pcm) / 32000 < 610:
        clip, text = clips[index % len(clips)]
        pcm += bytes(1 * 32000)
        start = len(pcm) / 32000
        pcm += clip
        regions.append({"start": start, "end": len(pcm) / 32000, "reference": text})
        reference.append(text)
        index += 1
    long_case = write_case(root, "japanese-long", pcm, " ".join(reference), regions)
    manifest = {"source": "google/fleurs, ja_jp test, CC-BY-4.0", "source_url": "https://huggingface.co/datasets/google/fleurs",
                "parquet_sha256": hashlib.sha256(args.parquet.read_bytes()).hexdigest(),
                "cases": cases, "long_case": long_case}
    (root / "suite.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"cases": len(cases), "long_seconds": long_case["duration"], "long_speech_regions": len(regions)}))


if __name__ == "__main__":
    main()
