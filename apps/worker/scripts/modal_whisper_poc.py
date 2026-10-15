"""Isolated Modal GPU experiment; does not change the production worker.

Run with::

    modal run apps/worker/scripts/modal_whisper_poc.py \
      --audio-path /absolute/path/to/audio.mp3 \
      --output-path /private/tmp/modal-whisper-result.json

The input is sent to a temporary Modal function. The model is baked into the
image so that a new GPU container does not download 3 GB at request time.
"""

from __future__ import annotations

import json
import hashlib
import time
from pathlib import Path

import modal


MODEL_REPO = "Systran/faster-whisper-large-v3"
MODEL_REVISION = "edaa852ec7e145841d8ffdb056a99866b5f0a478"
MODEL_PATH = "/models/large-v3"

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04", add_python="3.11"
    )
    .entrypoint([])
    .uv_pip_install("faster-whisper==1.2.1", "huggingface-hub==0.36.0")
    .run_commands(
        f"python -c 'from huggingface_hub import snapshot_download; "
        f'snapshot_download("{MODEL_REPO}", revision="{MODEL_REVISION}", '
        f'local_dir="{MODEL_PATH}")' + "'"
    )
)

app = modal.App("videoq-whisper-cost-poc")


@app.cls(
    image=image,
    gpu="T4",
    cpu=1,
    memory=8192,
    scaledown_window=2,
    min_containers=0,
    max_containers=1,
    timeout=1200,
)
class Transcriber:
    @modal.enter()
    def load(self) -> None:
        from faster_whisper import WhisperModel

        started = time.perf_counter()
        self.model = WhisperModel(MODEL_PATH, device="cuda", compute_type="float16")
        self.load_seconds = time.perf_counter() - started

    @modal.method()
    def transcribe(
        self,
        audio_bytes: bytes,
        language: str = "ja",
        vad_filter: bool = False,
        condition_on_previous_text: bool = False,
    ) -> dict:
        import io

        started = time.perf_counter()
        iterator, info = self.model.transcribe(
            io.BytesIO(audio_bytes),
            language=language,
            beam_size=5,
            vad_filter=vad_filter,
            condition_on_previous_text=condition_on_previous_text,
            word_timestamps=False,
        )
        segments = []
        discarded_outside_audio = 0
        for segment in iterator:
            if segment.start >= info.duration:
                discarded_outside_audio += 1
                continue
            end = min(segment.end, info.duration)
            if segment.start < end and segment.text.strip():
                segments.append({
                    "start": round(segment.start, 3),
                    "end": round(end, 3),
                    "text": segment.text.strip(),
                })
        return {
            "model": MODEL_REPO,
            "gpu": "T4",
            "load_seconds": round(self.load_seconds, 3),
            "inference_seconds": round(time.perf_counter() - started, 3),
            "audio_duration_seconds": info.duration,
            "language": info.language,
            "vad_filter": vad_filter,
            "condition_on_previous_text": condition_on_previous_text,
            "discarded_outside_audio": discarded_outside_audio,
            "segments": segments,
        }


@app.local_entrypoint()
def main(
    audio_path: str,
    output_path: str = "/private/tmp/videoq-modal-whisper-result.json",
    vad_filter: bool = False,
    condition_on_previous_text: bool = False,
) -> None:
    source = Path(audio_path).expanduser().resolve(strict=True)
    output = Path(output_path).expanduser()
    audio_bytes = source.read_bytes()
    started = time.perf_counter()
    result = Transcriber().transcribe.remote(
        audio_bytes,
        vad_filter=vad_filter,
        condition_on_previous_text=condition_on_previous_text,
    )
    result["client_elapsed_seconds"] = round(time.perf_counter() - started, 3)
    result["input_bytes"] = len(audio_bytes)
    result["input_sha256"] = hashlib.sha256(audio_bytes).hexdigest()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {k: v for k, v in result.items() if k != "segments"}
            | {"segment_count": len(result["segments"]), "output_path": str(output)},
            ensure_ascii=False,
        )
    )
