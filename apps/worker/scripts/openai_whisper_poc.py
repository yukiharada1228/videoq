"""Run the VideoQ Whisper API settings on a local PoC audio sample.

Results stay in a local JSON file. This script does not write to VideoQ's DB.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from pathlib import Path

from openai import OpenAI


def _api_key(env_file: Path | None) -> str:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key and env_file:
        for line in env_file.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                key = line.partition("=")[2].strip().strip('"\'')
                break
    if not key:
        raise RuntimeError("OPENAI_API_KEY is required")
    return key


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio_path", type=Path)
    parser.add_argument("--output-path", type=Path, required=True)
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    args = parser.parse_args()
    started = time.perf_counter()
    with OpenAI(api_key=_api_key(args.env_file), timeout=args.timeout_seconds, max_retries=0) as client:
        with args.audio_path.open("rb") as audio:
            result = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )
    elapsed = time.perf_counter() - started
    payload = result.model_dump()
    payload["client_elapsed_seconds"] = round(elapsed, 3)
    payload["input_bytes"] = args.audio_path.stat().st_size
    payload["input_sha256"] = hashlib.sha256(args.audio_path.read_bytes()).hexdigest()
    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "client_elapsed_seconds": payload["client_elapsed_seconds"],
        "duration": payload.get("duration"),
        "usage": payload.get("usage"),
        "segment_count": len(payload.get("segments") or []),
        "output_path": str(args.output_path),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
