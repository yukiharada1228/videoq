"""Private validation-only VAD frontend for a loopback vLLM speech server.

This is an acceptance experiment, not a production deployment entrypoint.
Silero weights are bundled in the pinned package; no model download is used.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
import io
import math
import os
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path
from threading import Lock
import wave

from fastapi import FastAPI, Form, HTTPException, UploadFile

RATE = 16000
vad_lock = Lock()


def merge_speech_spans(regions):
    spans = []
    for region in regions:
        start, end = int(region["start"]), int(region["end"])
        # Keep nearby phrases together, but do not pack unrelated utterances
        # across a long pause: Whisper can omit the shorter utterance there.
        if spans and start - spans[-1][1] <= RATE and end - spans[-1][0] <= 30 * RATE:
            spans[-1] = (spans[-1][0], end)
        else:
            spans.append((start, end))
    return spans


def restore_segments(parts, duration):
    result = []
    for start, end, payload in parts:
        rows = payload.get("segments") or []
        if not rows and str(payload.get("text", "")).strip():
            raise ValueError("Upstream did not return real timestamps")
        for row in rows:
            left, right = float(row["start"]), float(row["end"])
            if not math.isfinite(left) or not math.isfinite(right):
                raise ValueError("Upstream returned invalid timestamps")
            left = start / RATE + max(0, left)
            right = min(duration, end / RATE, start / RATE + right)
            text = row["text"]
            if left < right and text.strip():
                result.append({"id": len(result), "start": left, "end": right, "text": text})
    return result


@asynccontextmanager
async def lifespan(app):
    from silero_vad import load_silero_vad
    app.state.vad = load_silero_vad(onnx=True)
    yield
    del app.state.vad


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/audio/transcriptions")
def transcribe(file: UploadFile, model: str = Form(...), response_format: str = Form("verbose_json")):
    import numpy as np
    import httpx
    from openai import OpenAI
    from silero_vad import get_speech_timestamps

    if model != "whisper-local" or response_format != "verbose_json":
        raise HTTPException(400, "Use whisper-local and verbose_json")
    data = file.file.read(24 * 1024 * 1024 + 1)
    file.file.close()
    if not data or len(data) > 24 * 1024 * 1024:
        raise HTTPException(413, "Invalid audio size")
    with TemporaryDirectory(prefix="videoq-vad-check-") as directory:
        path = Path(directory) / "audio"
        path.write_bytes(data)
        filters = (["-af", "dynaudnorm=f=250:g=5:m=100"]
                   if os.environ.get("VIDEOQ_VALIDATION_AUDIO_NORMALIZE") == "1" else [])
        decoded = subprocess.run([
            "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file",
            "-format_whitelist", "mp3,wav,flac,mov,matroska,webm", "-i", str(path),
            "-t", "301.1", *filters, "-ar", str(RATE), "-ac", "1", "-f", "f32le", "-",
        ], capture_output=True, timeout=90, check=True)
    audio = np.frombuffer(decoded.stdout, dtype="<f4").copy()
    duration = len(audio) / RATE
    if not 0 < duration <= 301:
        raise HTTPException(400, "Audio must fit one worker interval")
    with vad_lock:
        regions = get_speech_timestamps(audio, app.state.vad, sampling_rate=RATE,
                    min_speech_duration_ms=0, min_silence_duration_ms=300,
                    speech_pad_ms=400, max_speech_duration_s=28)
    spans = merge_speech_spans(regions)

    def recognize(span):
        start, end = span
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes((np.clip(audio[start:end], -1, 1) * 32767).astype("<i2").tobytes())
        with OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="local-validation",
                    timeout=120, max_retries=0, http_client=httpx.Client(trust_env=False)) as client:
            response = client.audio.transcriptions.create(
                model=model, file=("speech.wav", output.getvalue()), language="ja",
                response_format="verbose_json", timestamp_granularities=["segment"],
            )
        return start, end, response.model_dump()

    with ThreadPoolExecutor(max_workers=4) as pool:
        segments = restore_segments(list(pool.map(recognize, spans)), duration)
    return {"task": "transcribe", "language": "ja", "duration": duration,
            "text": " ".join(row["text"].strip() for row in segments), "segments": segments}
