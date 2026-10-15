"""Compare Whisper large-v3 runtimes on Modal T4 with one lecture audio file."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import modal


MODEL_REPO = "Systran/faster-whisper-large-v3"
MODEL_REVISION = "edaa852ec7e145841d8ffdb056a99866b5f0a478"
CPP_REPO = "ggerganov/whisper.cpp"
CPP_REVISION = "c521a4b02f422512d734391fdf08bb08c0862f68"
CPP_COMMIT = "d1be6fde11ac6e0407606b4e42fe72d34add8037"

faster_image = (
    modal.Image.from_registry("nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04", add_python="3.11")
    .entrypoint([])
    .uv_pip_install("faster-whisper==1.2.1", "huggingface-hub==0.36.0")
    .run_commands(
        "python -c 'from huggingface_hub import snapshot_download; "
        f'snapshot_download("{MODEL_REPO}", revision="{MODEL_REVISION}", local_dir="/models/large-v3")' + "'"
    )
)

cpp_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.11")
    .entrypoint([])
    .apt_install("git", "cmake", "build-essential", "ffmpeg")
    .uv_pip_install("huggingface-hub==0.36.0")
    .run_commands(
        "git clone https://github.com/ggml-org/whisper.cpp.git /src/whisper.cpp",
        f"git -C /src/whisper.cpp checkout {CPP_COMMIT}",
        "ln -s /usr/local/cuda/lib64/stubs/libcuda.so /usr/local/cuda/lib64/stubs/libcuda.so.1",
        "cmake -S /src/whisper.cpp -B /src/whisper.cpp/build -DGGML_CUDA=1 -DCMAKE_CUDA_ARCHITECTURES=75 -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS=-Wl,-rpath-link,/usr/local/cuda/lib64/stubs",
        "cmake --build /src/whisper.cpp/build --target whisper-cli --config Release -j 4",
        "mkdir -p /models",
        "python -c 'from huggingface_hub import hf_hub_download; "
        f'hf_hub_download("{CPP_REPO}", "ggml-large-v3.bin", revision="{CPP_REVISION}", local_dir="/models")' + "'",
    )
)

torch_image = (
    modal.Image.from_registry("nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04", add_python="3.11")
    .entrypoint([])
    .apt_install("ffmpeg")
    .uv_pip_install("openai-whisper==20250625")
    .run_commands("python -c 'import whisper; whisper.load_model(\"large-v3\", download_root=\"/models\")'")
)

app = modal.App("videoq-whisper-backends-poc")
GPU_KWARGS = dict(gpu="T4", cpu=1, memory=8192, timeout=1200, scaledown_window=2, max_containers=1)


def faster_batched(audio_bytes: bytes, segmentation: str = "fixed", batch_size: int = 8) -> dict:
    import io
    from faster_whisper import BatchedInferencePipeline, WhisperModel
    from faster_whisper.audio import decode_audio

    t0 = time.perf_counter()
    model = WhisperModel("/models/large-v3", device="cuda", compute_type="float16")
    pipeline = BatchedInferencePipeline(model=model)
    loaded = time.perf_counter()
    audio = decode_audio(io.BytesIO(audio_bytes))
    duration = len(audio) / 16000
    if segmentation == "fixed":
        clips = [{"start": float(start), "end": min(float(start + 30), duration)}
                 for start in range(0, int(duration), 30)]
        forced_boundaries = len(clips) - 1
    elif segmentation == "vad":
        clips = None
        forced_boundaries = 0
    elif segmentation == "pause":
        from faster_whisper.vad import VadOptions, get_speech_timestamps

        speech = get_speech_timestamps(
            audio, vad_options=VadOptions(
                min_silence_duration_ms=150, speech_pad_ms=0,
                max_speech_duration_s=30,
            ),
        )
        pauses = [(left["end"] + right["start"]) / 32000
                  for left, right in zip(speech, speech[1:])
                  if right["start"] > left["end"]]
        clips = []
        position = 0.0
        forced_boundaries = 0
        while duration - position > 29.5:
            candidates = [p for p in pauses if position + 12 <= p <= position + 29.5]
            if candidates:
                end = min(candidates, key=lambda p: abs(p - (position + 27)))
            else:
                end = position + 29.5
                forced_boundaries += 1
            clips.append({"start": position, "end": end})
            position = end
        clips.append({"start": position, "end": duration})
    else:
        raise ValueError("segmentation must be fixed, vad, or pause")
    segments, info = pipeline.transcribe(
        audio, language="ja", beam_size=5, batch_size=batch_size,
        vad_filter=segmentation == "vad", clip_timestamps=clips,
        condition_on_previous_text=False, word_timestamps=False,
        without_timestamps=False,
    )
    rows = [{"start": round(s.start, 3), "end": round(s.end, 3),
             "text": s.text.strip(), "seek": s.seek} for s in segments]
    uncovered = []
    repaired_clips = []
    if segmentation == "pause":
        for item in speech:
            speech_start, speech_end = item["start"] / 16000, item["end"] / 16000
            cursor = speech_start
            for row in rows:
                if row["end"] < cursor or row["start"] > speech_end:
                    continue
                if row["start"] - cursor > 1.0:
                    uncovered.append([round(cursor, 3), round(row["start"], 3)])
                cursor = max(cursor, row["end"])
            if speech_end - cursor > 1.0:
                uncovered.append([round(cursor, 3), round(speech_end, 3)])
        repair_indices = set()
        for gap_start, gap_end in uncovered:
            repair_indices.update(
                i for i, clip in enumerate(clips)
                if clip["start"] < gap_end and clip["end"] > gap_start
            )
        for i in sorted(repair_indices):
            clip = clips[i]
            start, end = clip["start"], clip["end"]
            wave = audio[int(start * 16000):int(end * 16000)]
            retry_segments, _ = model.transcribe(
                wave, language="ja", beam_size=5, vad_filter=False,
                condition_on_previous_text=False, word_timestamps=False,
            )
            rows = [row for row in rows if not start <= row["start"] < end]
            rows.extend({"start": round(start + s.start, 3),
                         "end": round(min(end, start + s.end), 3),
                         "text": s.text.strip(), "seek": None}
                        for s in retry_segments if s.text.strip())
            repaired_clips.append(i)
        rows.sort(key=lambda row: (row["start"], row["end"]))
    return {"backend": "faster-whisper batched", "segmentation": segmentation,
            "batch_size": batch_size, "clip_count": len(clips) if clips else None,
            "clip_boundaries": [round(c["end"], 3) for c in clips] if clips else None,
            "forced_boundaries": forced_boundaries,
            "uncovered_speech": uncovered,
            "repaired_clips": repaired_clips,
            "load_seconds": round(loaded-t0, 3),
            "inference_seconds": round(time.perf_counter()-loaded, 3),
            "audio_duration_seconds": info.duration,
            "duration_after_vad_seconds": info.duration_after_vad, "segments": rows}


def whisper_cpp(audio_bytes: bytes) -> dict:
    with tempfile.TemporaryDirectory() as td:
        source = Path(td) / "input.mp3"
        wav = Path(td) / "input.wav"
        source.write_bytes(audio_bytes)
        t0 = time.perf_counter()
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)], check=True)
        prepared = time.perf_counter()
        out = Path(td) / "result"
        cmd = ["/src/whisper.cpp/build/bin/whisper-cli", "-m", "/models/ggml-large-v3.bin",
               "-f", str(wav), "-l", "ja", "-bs", "5", "-mc", "0", "-oj", "-of", str(out), "-np"]
        completed = subprocess.run(cmd, text=True, capture_output=True)
        if completed.returncode:
            raise RuntimeError(completed.stderr[-5000:])
        result = json.loads(out.with_suffix(".json").read_text())
        rows = []
        for seg in result["transcription"]:
            rows.append({"start": seg["offsets"]["from"] / 1000,
                         "end": seg["offsets"]["to"] / 1000,
                         "text": seg["text"].strip()})
        return {"backend": "whisper.cpp CUDA", "prepare_seconds": round(prepared-t0, 3),
                "inference_seconds": round(time.perf_counter()-prepared, 3),
                "segments": rows, "stderr_tail": completed.stderr[-1200:]}


def pytorch_whisper(audio_bytes: bytes) -> dict:
    import whisper

    with tempfile.TemporaryDirectory() as td:
        source = Path(td) / "input.mp3"
        source.write_bytes(audio_bytes)
        t0 = time.perf_counter()
        model = whisper.load_model("large-v3", device="cuda", download_root="/models")
        loaded = time.perf_counter()
        result = model.transcribe(str(source), language="ja", beam_size=5,
                                  condition_on_previous_text=False, fp16=True)
        rows = [{"start": round(s["start"], 3), "end": round(s["end"], 3),
                 "text": s["text"].strip()} for s in result["segments"]]
        return {"backend": "openai-whisper PyTorch", "load_seconds": round(loaded-t0, 3),
                "inference_seconds": round(time.perf_counter()-loaded, 3), "segments": rows}


SELECTED = os.environ.get("VIDEOQ_POC_BACKEND")
FUNCS = {"batched": faster_batched, "cpp": whisper_cpp, "pytorch": pytorch_whisper}
IMAGES = {"batched": faster_image, "cpp": cpp_image, "pytorch": torch_image}
if SELECTED in FUNCS:
    selected_remote = app.function(image=IMAGES[SELECTED], **GPU_KWARGS)(FUNCS[SELECTED])


@app.local_entrypoint()
def main(backend: str, audio_path: str, output_path: str,
         segmentation: str = "fixed", batch_size: int = 8) -> None:
    if backend != SELECTED:
        raise ValueError("Set VIDEOQ_POC_BACKEND to the selected backend")
    data = Path(audio_path).expanduser().resolve(strict=True).read_bytes()
    t0 = time.perf_counter()
    result = (selected_remote.remote(data, segmentation, batch_size)
              if backend == "batched" else selected_remote.remote(data))
    result["client_elapsed_seconds"] = round(time.perf_counter()-t0, 3)
    result["input_sha256"] = hashlib.sha256(data).hexdigest()
    result["input_bytes"] = len(data)
    output = Path(output_path).expanduser()
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in ("segments", "stderr_tail")}
                     | {"segment_count": len(result["segments"]), "output_path": str(output)}, ensure_ascii=False))
