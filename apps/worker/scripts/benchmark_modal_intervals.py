"""Measure the production Whisper algorithm with different outer interval sizes.

Run with Modal credentials from the repository root, for example:
    VIDEOQ_BENCH_GPU=L4 VIDEOQ_BENCH_MEMORY_MIB=4096 \
    modal run --env main apps/worker/scripts/benchmark_modal_intervals.py \
        --audio-path /private/tmp/lecture.mp3 --chunk-seconds 900 \
        --output-path /private/tmp/benchmark-900.json

The input is uploaded to a temporary Modal app. This does not deploy or call the
production endpoint. A fresh invocation per interval matches the worker's calls.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
from time import perf_counter

import modal
from fastapi import Request


# Match the production image without importing its authenticated Web Function in
# the benchmark container's module namespace.
image = (
    modal.Image.from_registry("nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04", add_python="3.11")
    .entrypoint([])
    .uv_pip_install(
        "faster-whisper==1.2.1", "huggingface-hub==0.36.0",
        "fastapi==0.115.12", "python-multipart==0.0.20",
    )
    .run_commands(
        "python -c 'from huggingface_hub import snapshot_download; "
        'snapshot_download("Systran/faster-whisper-large-v3", '
        'revision="edaa852ec7e145841d8ffdb056a99866b5f0a478", '
        'local_dir="/models/large-v3")' + "'"
    )
    .add_local_file("apps/worker/modal_batched_whisper.py", "/root/modal_batched_whisper.py")
)
app = modal.App("videoq-whisper-interval-poc")
MEMORY_MIB = int(os.environ.get("VIDEOQ_BENCH_MEMORY_MIB", "8192"))
GPU = os.environ.get("VIDEOQ_BENCH_GPU", "T4").upper()
if GPU not in {"T4", "L4", "A10"}:
    raise ValueError("VIDEOQ_BENCH_GPU must be T4, L4, or A10")
BENCH_TOKEN = secrets.token_urlsafe(32)


@app.cls(
    image=image, gpu=GPU, cpu=1, memory=MEMORY_MIB, timeout=300,
    scaledown_window=2, min_containers=0, max_containers=4,
    secrets=[modal.Secret.from_dict({"VIDEOQ_WHISPER_TOKEN": BENCH_TOKEN})],
)
class BenchmarkWhisper:
    @modal.enter()
    def load(self):
        import resource
        from faster_whisper import WhisperModel

        self.model = WhisperModel("/models/large-v3", device="cuda", compute_type="float16")
        self.load_max_rss_mib = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

    @modal.method()
    def transcribe(self, audio: bytes):
        import resource
        from modal_batched_whisper import transcribe_with_repair

        result = transcribe_with_repair(self.model, audio)
        result["load_max_rss_mib"] = round(self.load_max_rss_mib, 1)
        result["process_max_rss_mib"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
        return result

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException
        from starlette.datastructures import UploadFile
        from modal_batched_whisper import MAX_AUDIO_BYTES, transcribe_with_repair

        web = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

        @web.post("/v1/audio/transcriptions")
        async def transcribe(request: Request):
            authorization = request.headers.get("authorization", "")
            if not authorization.startswith("Bearer ") or not hmac.compare_digest(
                authorization[7:], os.environ["VIDEOQ_WHISPER_TOKEN"]
            ):
                raise HTTPException(status_code=401)
            form = await request.form(max_files=1, max_fields=8)
            file = form.get("file")
            if form.get("model") != "large-v3" or not isinstance(file, UploadFile):
                raise HTTPException(status_code=400)
            audio = await file.read(MAX_AUDIO_BYTES + 1)
            if not audio or len(audio) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413)
            return transcribe_with_repair(self.model, audio)

        return web


def _duration(path: Path) -> float:
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], check=True, capture_output=True, text=True)
    return float(result.stdout.strip())


@app.local_entrypoint()
def main(audio_path: str, chunk_seconds: int, output_path: str,
         http_check: bool = False) -> None:
    if chunk_seconds not in (300, 600, 900, 1200, 1800):
        raise ValueError("chunk_seconds must be one of 300, 600, 900, 1200, 1800")
    source = Path(audio_path).resolve(strict=True)
    duration = _duration(source)
    jobs = []
    with tempfile.TemporaryDirectory(prefix="videoq-interval-benchmark-") as tmp:
        for index, start in enumerate(range(0, int(duration + chunk_seconds - 1), chunk_seconds)):
            length = min(chunk_seconds, duration - start)
            if length <= 0:
                break
            chunk = Path(tmp) / f"{index}.mp3"
            subprocess.run([
                "ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(start), "-i", str(source),
                "-t", str(length), "-map", "0:a:0", "-vn", "-af", "aresample=async=1:first_pts=0",
                "-acodec", "mp3", "-ab", "64k", "-ar", "16000", "-ac", "1", str(chunk),
            ], check=True)
            data = chunk.read_bytes()
            if len(data) > 16 * 1024 * 1024:
                raise ValueError(f"interval {index} exceeds the production upload limit")
            jobs.append((index, start, length, data))

    service = BenchmarkWhisper()
    started = perf_counter()

    if http_check:
        from openai import OpenAI

        if len(jobs) != 1:
            raise ValueError("HTTP check requires one interval")
        endpoint = service.api.get_web_url()
        if not endpoint:
            raise RuntimeError("Benchmark Web Function URL is unavailable")
        with OpenAI(api_key=BENCH_TOKEN, base_url=f"{endpoint}/v1", timeout=360, max_retries=0) as client:
            result = client.audio.transcriptions.create(
                model="large-v3", file=("audio.mp3", io.BytesIO(jobs[0][3])),
                response_format="verbose_json",
            )
        summary = {
            "chunk_seconds": chunk_seconds, "duration_seconds": duration,
            "memory_limit_mib": MEMORY_MIB,
            "gpu": GPU,
            "client_elapsed_seconds": round(perf_counter() - started, 3),
            "segment_count": len(result.segments),
            "text_sha256": hashlib.sha256(result.text.encode()).hexdigest(),
        }
        Path(output_path).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps(summary, ensure_ascii=False))
        return

    def execute(job):
        index, start, length, data = job
        result = service.transcribe.remote(data)
        return {"index": index, "start": start, "length": length,
                "audio_bytes": len(data), "result": result}

    with ThreadPoolExecutor(max_workers=4) as pool:
        rows = sorted(pool.map(execute, jobs), key=lambda row: row["index"])
    segments = [
        {**segment, "start": round(segment["start"] + row["start"], 3),
         "end": round(segment["end"] + row["start"], 3)}
        for row in rows for segment in row["result"]["segments"]
    ]
    text = "".join(segment["text"] for segment in segments)
    summary = {
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "chunk_seconds": chunk_seconds, "duration_seconds": duration,
        "client_elapsed_seconds": round(perf_counter() - started, 3),
        "chunk_count": len(rows), "chunks": [
            {key: row[key] for key in ("index", "start", "length", "audio_bytes")}
            | {key: row["result"][key] for key in (
                "processing_seconds", "processing_mode", "repaired_clip_count",
                "load_max_rss_mib", "process_max_rss_mib",
            )}
            for row in rows
        ],
        "memory_limit_mib": MEMORY_MIB,
        "gpu": GPU,
        "segment_count": len(segments), "text_sha256": hashlib.sha256(text.encode()).hexdigest(),
        "text": text, "segments": segments,
    }
    Path(output_path).write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: value for key, value in summary.items() if key not in ("text", "segments")}, ensure_ascii=False))
