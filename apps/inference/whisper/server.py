"""Only the OpenAI-compatible transcription subset that VideoQ consumes.

The operator selects one checkpoint at deployment time. Requests cannot select
or download arbitrary models. Runtime always opens local files, including VAD.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
import math
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from typing import Annotated

from fastapi import FastAPI, Form, HTTPException, UploadFile

MAX_AUDIO_BYTES = 24 * 1024 * 1024
MODEL_ALIAS = "whisper-local"
model_lock = Lock()


def load_model():
    from faster_whisper import WhisperModel

    return WhisperModel(
        os.environ.get("WHISPER_MODEL_PATH", "/models/whisper"),
        device=os.environ.get("WHISPER_DEVICE", "cpu"),
        compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
        cpu_threads=int(os.environ.get("WHISPER_CPU_THREADS", "4")),
        num_workers=1,
        local_files_only=True,
    )


def configured_batch_size():
    try:
        size = int(os.environ.get("WHISPER_BATCH_SIZE", "1"))
    except ValueError as error:
        raise ValueError("WHISPER_BATCH_SIZE must be an integer between 1 and 64") from error
    if not 1 <= size <= 64:
        raise ValueError("WHISPER_BATCH_SIZE must be an integer between 1 and 64")
    return size


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.batch_size = configured_batch_size()
    app.state.model = load_model()
    try:
        yield
    finally:
        del app.state.model
        del app.state.batch_size


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    if not hasattr(app.state, "model"):
        raise HTTPException(503, "Model is not loaded")
    return {"status": "ok"}


@app.post("/v1/audio/transcriptions")
def transcribe(
    file: UploadFile,
    model: Annotated[str, Form()],
    response_format: Annotated[str, Form()] = "verbose_json",
    timestamp_granularities: Annotated[list[str], Form(alias="timestamp_granularities[]")] = ["segment"],
):
    if model != MODEL_ALIAS or response_format != "verbose_json" or timestamp_granularities != ["segment"]:
        raise HTTPException(400, "Use whisper-local, verbose_json and segment timestamps")
    if not model_lock.acquire(blocking=False):
        raise HTTPException(503, "Transcription server is busy", headers={"Retry-After": "5"})
    try:
        with TemporaryDirectory(prefix="videoq-whisper-") as directory:
            audio = Path(directory) / "audio"
            size = 0
            with audio.open("wb") as output:
                while chunk := file.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_AUDIO_BYTES:
                        raise HTTPException(413, "Audio exceeds 24 MiB")
                    output.write(chunk)
            if size == 0:
                raise HTTPException(400, "Audio is empty")
            try:
                transcriber = app.state.model
                options = {}
                if app.state.batch_size > 1:
                    from faster_whisper import BatchedInferencePipeline

                    # Reuse the loaded weights, but keep mutable pipeline state
                    # within this request, including when iteration fails.
                    transcriber = BatchedInferencePipeline(model=app.state.model)
                    options["batch_size"] = app.state.batch_size
                iterator, info = transcriber.transcribe(
                    str(audio), beam_size=5, vad_filter=True,
                    condition_on_previous_text=False,
                    # The batched API defaults to text-only decoding. VideoQ
                    # needs subtitle cues, not one timestamp per VAD chunk.
                    without_timestamps=False,
                    **options,
                )
                duration = float(info.duration)
                if not math.isfinite(duration) or duration < 0:
                    raise ValueError("Invalid audio duration")
                segments = []
                for segment in iterator:
                    start, end = float(segment.start), float(segment.end)
                    if not math.isfinite(start) or not math.isfinite(end):
                        raise ValueError("Invalid segment timestamps")
                    # Decoder padding can extend past EOF. Preserve source time
                    # and never publish a subtitle outside this input interval.
                    start, end = max(0.0, start), min(duration, end)
                    if start < end and segment.text.strip():
                        segments.append({
                            "id": len(segments), "start": start,
                            "end": end, "text": segment.text,
                        })
            except (ValueError, RuntimeError) as error:
                # Keep audio contents, paths and inference details out of responses.
                raise HTTPException(422, "Audio could not be transcribed") from error
            return {
                "task": "transcribe", "language": info.language,
                "duration": duration,
                "text": " ".join(segment["text"].strip() for segment in segments),
                "segments": segments,
            }
    finally:
        file.file.close()
        model_lock.release()


def download_model():
    """Run explicitly during provisioning; never called by the API."""
    from huggingface_hub import snapshot_download

    path = Path(os.environ.get("WHISPER_MODEL_PATH", "/models/whisper"))
    revision = os.environ["WHISPER_MODEL_REVISION"]
    marker = path / ".videoq-revision"
    if marker.exists() and marker.read_text() == revision and (path / "model.bin").is_file():
        return
    snapshot_download(
        repo_id=os.environ["WHISPER_MODEL_REPO"],
        revision=revision,
        local_dir=str(path),
        allow_patterns=["model.bin", "config.json", "tokenizer.json", "vocabulary.*", "preprocessor_config.json"],
    )
    marker.write_text(revision)


if __name__ == "__main__":
    import sys
    if sys.argv[1:] != ["download"]:
        raise SystemExit("Usage: python server.py download")
    download_model()
