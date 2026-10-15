"""Authenticated Modal Whisper API for VideoQ's 300-second transcription jobs.

Deploy with ``modal deploy apps/worker/modal_batched_whisper.py`` after creating
the ``videoq-whisper-auth`` Modal Secret with ``VIDEOQ_WHISPER_TOKEN``.
"""

from __future__ import annotations

import hmac
import os
from time import perf_counter

import modal
from fastapi import Request


MODEL_REPO = "Systran/faster-whisper-large-v3"
MODEL_REVISION = "edaa852ec7e145841d8ffdb056a99866b5f0a478"
MODEL_PATH = "/models/large-v3"
MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_DURATION_SECONDS = 301

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04", add_python="3.11"
    )
    .entrypoint([])
    .uv_pip_install(
        "faster-whisper==1.2.1", "huggingface-hub==0.36.0",
        "fastapi==0.115.12", "python-multipart==0.0.20",
    )
    .run_commands(
        "python -c 'from huggingface_hub import snapshot_download; "
        f'snapshot_download("{MODEL_REPO}", revision="{MODEL_REVISION}", '
        f'local_dir="{MODEL_PATH}")' + "'"
    )
)

app = modal.App("videoq-batched-whisper")


def transcribe_with_repair(model, audio_bytes: bytes) -> dict:
    """Batch pause-aligned clips, then repair uncovered speech clips sequentially."""
    import io
    from faster_whisper import BatchedInferencePipeline
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import VadOptions, get_speech_timestamps

    started = perf_counter()
    audio = decode_audio(io.BytesIO(audio_bytes))
    duration = len(audio) / 16000
    if not 0 < duration <= MAX_DURATION_SECONDS:
        raise ValueError("audio duration must be between 0 and 301 seconds")

    speech = get_speech_timestamps(
        audio,
        vad_options=VadOptions(
            min_silence_duration_ms=150, speech_pad_ms=0,
            max_speech_duration_s=30,
        ),
    )
    pauses = [
        (left["end"] + right["start"]) / 32000
        for left, right in zip(speech, speech[1:])
        if right["start"] > left["end"]
    ]
    clips = []
    position = 0.0
    forced = False
    while duration - position > 29.5:
        candidates = [p for p in pauses if position + 12 <= p <= position + 29.5]
        if candidates:
            end = min(candidates, key=lambda p: abs(p - (position + 27)))
        else:
            end = position + 29.5
            forced = True
        clips.append({"start": position, "end": end})
        position = end
    clips.append({"start": position, "end": duration})

    if not speech:
        return {"text": "", "segments": [], "duration": duration,
                "language": "ja", "processing_mode": "silence",
                "repaired_clip_count": 0,
                "processing_seconds": round(perf_counter() - started, 3)}

    # A forced cut can split a word. Fall back to the known-good sequential path.
    if forced:
        iterator, _ = model.transcribe(
            audio, language="ja", beam_size=5, vad_filter=False,
            condition_on_previous_text=False, word_timestamps=False,
        )
        rows = list(iterator)
        mode = "sequential_fallback"
        repaired_count = 0
    else:
        pipeline = BatchedInferencePipeline(model=model)
        iterator, _ = pipeline.transcribe(
            audio, language="ja", beam_size=5, batch_size=8,
            vad_filter=False, clip_timestamps=clips,
            condition_on_previous_text=False, word_timestamps=False,
            without_timestamps=False,
        )
        rows = list(iterator)
        repair_indices = set()
        for item in speech:
            speech_start = item["start"] / 16000
            speech_end = item["end"] / 16000
            cursor = speech_start
            for row in rows:
                if row.end < cursor or row.start > speech_end:
                    continue
                if row.start - cursor > 1.0:
                    repair_indices.update(
                        i for i, clip in enumerate(clips)
                        if clip["start"] < row.start and clip["end"] > cursor
                    )
                cursor = max(cursor, row.end)
            if speech_end - cursor > 1.0:
                repair_indices.update(
                    i for i, clip in enumerate(clips)
                    if clip["start"] < speech_end and clip["end"] > cursor
                )

        # Preserve a segment's original time while replacing only suspect clips.
        data = [(row.start, row.end, row.text) for row in rows]
        for i in sorted(repair_indices):
            clip = clips[i]
            start, end = clip["start"], clip["end"]
            wave = audio[int(start * 16000):int(end * 16000)]
            retry, _ = model.transcribe(
                wave, language="ja", beam_size=5, vad_filter=False,
                condition_on_previous_text=False, word_timestamps=False,
            )
            data = [row for row in data if not start <= row[0] < end]
            data.extend((start + row.start, min(end, start + row.end), row.text)
                        for row in retry)
        data.sort(key=lambda row: (row[0], row[1]))
        rows = data
        mode = "batched_with_repair"
        repaired_count = len(repair_indices)

    segments = []
    for row in rows:
        start, end, value = row if isinstance(row, tuple) else (row.start, row.end, row.text)
        start, end = max(0.0, float(start)), min(duration, float(end))
        content = value.strip()
        if start < end and content:
            segments.append({"start": round(start, 3), "end": round(end, 3),
                             "text": content})
    return {"text": "".join(row["text"] for row in segments),
            "segments": segments, "duration": duration, "language": "ja",
            "processing_mode": mode, "repaired_clip_count": repaired_count,
            "processing_seconds": round(perf_counter() - started, 3)}


@app.cls(
    image=image, gpu="T4", cpu=1, memory=8192, timeout=300,
    scaledown_window=2, min_containers=0, max_containers=4,
    secrets=[modal.Secret.from_name("videoq-whisper-auth")],
)
class WhisperService:
    @modal.enter()
    def load(self) -> None:
        from faster_whisper import WhisperModel

        self.model = WhisperModel(MODEL_PATH, device="cuda", compute_type="float16")

    @modal.asgi_app()
    def api(self):
        from fastapi import FastAPI, HTTPException
        from starlette.datastructures import UploadFile

        web = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

        @web.post("/v1/audio/transcriptions")
        async def transcribe(request: Request):
            expected = os.environ["VIDEOQ_WHISPER_TOKEN"]
            authorization = request.headers.get("authorization", "")
            if not authorization.startswith("Bearer ") or not hmac.compare_digest(
                authorization[7:], expected
            ):
                raise HTTPException(status_code=401, detail="Unauthorized")
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > MAX_AUDIO_BYTES + 65536:
                raise HTTPException(status_code=413, detail="Audio exceeds 8 MiB")
            form = await request.form(max_files=1, max_fields=8)
            file = form.get("file")
            model = form.get("model")
            response_format = form.get("response_format", "verbose_json")
            if model != "large-v3" or response_format != "verbose_json":
                raise HTTPException(status_code=400, detail="Unsupported transcription settings")
            if not isinstance(file, UploadFile):
                raise HTTPException(status_code=400, detail="Audio file is required")
            audio = await file.read(MAX_AUDIO_BYTES + 1)
            if not audio or len(audio) > MAX_AUDIO_BYTES:
                raise HTTPException(status_code=413, detail="Audio exceeds 8 MiB")
            try:
                return transcribe_with_repair(self.model, audio)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        return web
