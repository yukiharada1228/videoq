"""Check local transcription + indexing embeddings without DB writes or uploads.

Run against a short, nonsensitive video with WHISPER_BACKEND=local,
WHISPER_LOCAL_URL, EMBEDDING_PROVIDER, EMBEDDING_MODEL and an explicit embedding URL.
"""
import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker_python.pipeline.transcription import transcribe_audio_interval
from worker_python.pipeline.embeddings import embed_texts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path)
    parser.add_argument("--seconds", type=int, default=30)
    args = parser.parse_args()
    if not args.video.is_file() or not 1 <= args.seconds <= 300:
        parser.error("Provide a local video and --seconds between 1 and 300")
    if os.environ.get("WHISPER_BACKEND") not in {"local", "whisper.cpp"}:
        parser.error("WHISPER_BACKEND must be local or whisper.cpp")
    provider = os.environ.get("EMBEDDING_PROVIDER")
    if provider != "openai":
        parser.error("EMBEDDING_PROVIDER must be openai (the API protocol)")
    for key in ("WHISPER_LOCAL_URL", "EMBEDDING_BASE_URL", "EMBEDDING_MODEL"):
        if not os.environ.get(key):
            parser.error(f"{key} is required; implicit provider defaults are not used")
    segments = transcribe_audio_interval(str(args.video.resolve()), 0, args.seconds)
    if not segments:
        raise RuntimeError("No speech segments returned; use a video with audible speech")
    vectors = embed_texts([segment["text"] for segment in segments[:2]])
    print(json.dumps({
        "whisperBackend": "local", "segments": len(segments),
        "embeddingProvider": provider, "embeddingModel": os.environ["EMBEDDING_MODEL"],
        "embeddingRows": len(vectors), "dimensions": len(vectors[0]),
    }))


if __name__ == "__main__":
    main()
