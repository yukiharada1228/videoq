"""Only the OpenAI-compatible transcription subset that VideoQ consumes.

The operator selects one checkpoint at deployment time. Requests cannot select
or download arbitrary models. Runtime always opens local files, including VAD.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = load_model()
    yield
    del app.state.model


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
                iterator, info = app.state.model.transcribe(
                    str(audio), beam_size=5, vad_filter=True,
                    condition_on_previous_text=False,
                )
                segments = [
                    {"id": index, "start": segment.start, "end": segment.end, "text": segment.text}
                    for index, segment in enumerate(iterator)
                ]
            except (ValueError, RuntimeError) as error:
                # Keep audio contents, paths and inference details out of responses.
                raise HTTPException(422, "Audio could not be transcribed") from error
            return {
                "task": "transcribe", "language": info.language,
                "duration": info.duration,
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
