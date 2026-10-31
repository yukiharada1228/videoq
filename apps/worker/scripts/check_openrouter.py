"""Probe OpenRouter Whisper timestamps and indexing embeddings without DB writes."""
import argparse
import json
import math
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from worker_python.pipeline.embeddings import embed_texts
from worker_python.pipeline.transcription import _whisper_client, _whisper_file


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path, help="Short, non-sensitive speech fixture (uploaded to OpenRouter).")
    args = parser.parse_args()
    if not (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_FEDERATION_POLICY_ID")):
        parser.error("OPENROUTER_FEDERATION_POLICY_ID or OPENROUTER_API_KEY is required")
    if not args.audio.is_file() or not 0 < args.audio.stat().st_size <= 24 * 1024 * 1024:
        parser.error("Provide a nonempty speech file no larger than 24 MiB")
    # Isolate this probe from stale local/direct-provider overrides.
    os.environ.update(WHISPER_BACKEND="openrouter", OPENAI_BASE_URL="https://openrouter.ai/api/v1",
                      EMBEDDING_BASE_URL="", EMBEDDING_API_KEY="", EMBEDDING_MODEL="openai/text-embedding-3-small")
    client, model = _whisper_client()
    with client:
        segments = _whisper_file(client, args.audio, model, offset=0)
    if not segments or any(not segment["text"].strip() or
                           not math.isfinite(segment["start"]) or not math.isfinite(segment["end"]) or
                           not 0 <= segment["start"] < segment["end"] for segment in segments):
        raise RuntimeError("Expected speech with real, finite segment start/end timestamps")
    vectors = embed_texts([segment["text"] for segment in segments[:2]])
    print(json.dumps({"whisperModel": model, "segments": len(segments), "embeddingRows": len(vectors),
                      "dimensions": len(vectors[0])}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Provider exceptions may contain transcript/request details. Keep them out of logs.
        print(json.dumps({"status": "failed", "errorType": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
