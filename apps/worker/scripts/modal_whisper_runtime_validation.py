"""Bounded private GPU acceptance; no deployed web endpoint or production data.

VIDEOQ_WHISPER_VALIDATION_ENGINE=vllm|cpp python -m modal run this_file.py
  --fixtures /local/public-fixtures --output /local/result.json

One L4, four CPUs, one container and a 20-minute execution limit per invocation.
Models are provisioned in the build; runtime external networking is blocked.
"""
from pathlib import Path
import json
import os

import modal

ROOT = Path(__file__).resolve().parents[1]
MODEL_REVISION = "41f01f3fe87f28c78e2fbf8b568835947dd65ed9"
CPP_REVISION = "d1be6fde11ac6e0407606b4e42fe72d34add8037"
CPP_MODELS_REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1"
ENGINE = os.environ.get("VIDEOQ_WHISPER_VALIDATION_ENGINE", "vllm")
VAD_ENABLED = os.environ.get("VIDEOQ_WHISPER_VALIDATION_VAD") == "1"
NORMALIZE_ENABLED = os.environ.get("VIDEOQ_VALIDATION_AUDIO_NORMALIZE") == "1"
if ENGINE not in ("vllm", "cpp"):
    raise ValueError("Select vllm or cpp")

app = modal.App("videoq-whisper-runtime-validation")
if ENGINE == "vllm":
    image = (
        modal.Image.from_registry("vllm/vllm-openai@sha256:6ee133356d49ed24cee03dd0cda3d3980279a11c107ce3e752c89e76540f41c9")
        .entrypoint([])
        .run_commands("ln -s /usr/bin/python3 /usr/local/bin/python")
        .apt_install("ffmpeg")
        .uv_pip_install("vllm[audio]==0.32.0", "psycopg[binary]==3.3.4", "openai==3.35.1")
        .run_commands(
            "python3 -c 'from huggingface_hub import snapshot_download; "
            f"snapshot_download(\"openai/whisper-large-v3-turbo\", revision=\"{MODEL_REVISION}\", "
            "local_dir=\"/models/whisper\", allow_patterns=[\"*.json\",\"*.safetensors\",\"*.txt\"])'"
        )
    )
else:
    image = (
        modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
        .entrypoint([])
        .apt_install("git", "cmake", "build-essential", "ffmpeg")
        .uv_pip_install("huggingface-hub==0.36.0", "psycopg[binary]==3.3.4", "openai==3.35.1")
        .run_commands(
            "git clone https://github.com/ggml-org/whisper.cpp.git /src/whisper.cpp",
            f"git -C /src/whisper.cpp checkout {CPP_REVISION}",
            "ln -s /usr/local/cuda/lib64/stubs/libcuda.so /usr/local/cuda/lib64/stubs/libcuda.so.1",
            "cmake -S /src/whisper.cpp -B /src/whisper.cpp/build -DGGML_CUDA=1 -DCMAKE_CUDA_ARCHITECTURES=89 -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS=-Wl,-rpath-link,/usr/local/cuda/lib64/stubs",
        )
        .run_commands(
            "cmake --build /src/whisper.cpp/build --target whisper-server --config Release -j 4",
        )
        .run_commands(
            "mkdir -p /models/whisper",
            "python -c 'from huggingface_hub import hf_hub_download; "
            f"hf_hub_download(\"ggerganov/whisper.cpp\", \"ggml-large-v3-turbo.bin\", revision=\"{CPP_MODELS_REVISION}\", local_dir=\"/models/whisper\")'",
        )
    )
image = image.uv_pip_install("httpx==0.28.1")
if VAD_ENABLED:
    if ENGINE == "vllm":
        image = (image.uv_pip_install("silero-vad==6.2.3", "onnxruntime==1.31.0")
            .add_local_file(Path(__file__).with_name("whisper_vad_validation_gateway.py"),
                            "/opt/videoq/whisper_vad_validation_gateway.py", copy=True))
    else:
        image = image.run_commands(
            "python -c 'from huggingface_hub import hf_hub_download; "
            "hf_hub_download(\"ggml-org/whisper-vad\", \"ggml-silero-v6.2.0.bin\", "
            "revision=\"9ffd54a1e1ee413ddf265af9913beaf518d1639b\", local_dir=\"/models/whisper\")'"
        )
image = (image
    .add_local_dir(ROOT / "worker_python", "/opt/videoq/worker_python", copy=True,
                   ignore=["**/__pycache__/**"])
    .add_local_file(Path(__file__).with_name("whisper_runtime_validation.py"),
                    "/opt/videoq/whisper_runtime_validation.py", copy=True)
    .env({"PYTHONPATH": "/opt/videoq", "HF_HUB_OFFLINE": "1",
          "HF_HUB_DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1", "VLLM_NO_USAGE_STATS": "1"})
)
if NORMALIZE_ENABLED:
    image = image.env({"VIDEOQ_VALIDATION_AUDIO_NORMALIZE": "1"})


@app.function(image=image, gpu="L4", cpu=4, memory=32768, timeout=1200,
              max_containers=1, scaledown_window=2, block_network=True,
              single_use_containers=True)
def validate(cases, long_case, engine, with_vad=False, cpp_beam_size=5):
    import importlib.metadata
    import subprocess
    import sys
    import tempfile
    import time
    import urllib.request

    sys.path.insert(0, "/opt/videoq")
    from whisper_runtime_validation import run_suite

    command = (["vllm", "serve", "/models/whisper", "--served-model-name", "whisper-local",
                "--host", "127.0.0.1", "--port", "8080", "--dtype", "float16",
                "--gpu-memory-utilization", "0.70", "--max-num-seqs", "8"] if engine == "vllm"
               else ["/src/whisper.cpp/build/bin/whisper-server", "-m", "/models/whisper/ggml-large-v3-turbo.bin",
                     "--host", "127.0.0.1", "--port", "8080", "--inference-path", "/v1/audio/transcriptions",
                     "--convert", "--tmp-dir", "/tmp", "-l", "ja", "-bs", str(cpp_beam_size), "--no-fallback", "-t", "4"])
    if with_vad and engine == "cpp":
        command += ["--vad", "--vad-model", "/models/whisper/ggml-silero-v6.2.0.bin"]
    metadata = {
        "engine": engine, "command": command, "external_network_blocked": True,
        "vad_enabled": with_vad,
        "audio_normalization": os.environ.get("VIDEOQ_VALIDATION_AUDIO_NORMALIZE") == "1",
        "gpu": subprocess.check_output(["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"], text=True).strip(),
        "packages": {p: importlib.metadata.version(p) for p in ("openai", "psycopg")},
    }
    if engine == "vllm":
        metadata["packages"]["vllm"] = importlib.metadata.version("vllm")
        metadata["model_revision"] = MODEL_REVISION
    with tempfile.TemporaryFile(mode="w+") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        gateway = None
        started = time.perf_counter()
        try:
            ready = False
            while time.perf_counter() - started < 600:
                if process.poll() is not None:
                    break
                try:
                    with urllib.request.urlopen("http://127.0.0.1:8080/health", timeout=2) as response:
                        ready = response.status == 200
                    if ready:
                        break
                except Exception:
                    time.sleep(1)
            metadata["startup_seconds"] = time.perf_counter() - started
            if ready:
                base_url = "http://127.0.0.1:8080/v1"
                if with_vad and engine == "vllm":
                    gateway = subprocess.Popen(["python", "-m", "uvicorn", "whisper_vad_validation_gateway:app",
                        "--host", "127.0.0.1", "--port", "8090", "--no-access-log"], stdout=log, stderr=subprocess.STDOUT)
                    gateway_started = time.perf_counter()
                    while time.perf_counter() - gateway_started < 90:
                        if gateway.poll() is not None:
                            raise RuntimeError("VAD validation frontend did not start")
                        try:
                            with urllib.request.urlopen("http://127.0.0.1:8090/health", timeout=2) as response:
                                if response.status == 200:
                                    break
                        except Exception:
                            time.sleep(1)
                    base_url = "http://127.0.0.1:8090/v1"
                metadata["default"] = run_suite(base_url, cases, long_case=long_case)
                if engine == "vllm" and not with_vad:
                    metadata["beam5"] = run_suite("http://127.0.0.1:8080/v1", cases,
                                                  extra_body={"use_beam_search": True, "n": 5})
            else:
                metadata["startup_error"] = process.poll()
            metadata["gpu_after"] = subprocess.check_output(["nvidia-smi", "--query-gpu=memory.used,utilization.gpu", "--format=csv,noheader"], text=True).strip()
        except Exception as error:
            metadata["validation_error"] = {"type": type(error).__name__, "detail": str(error)[:300]}
        finally:
            if gateway is not None:
                gateway.terminate()
                try:
                    gateway.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    gateway.kill()
                    gateway.wait(timeout=10)
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=10)
            log.seek(0)
            metadata["server_log_tail"] = log.read()[-16000:]
    return metadata


@app.local_entrypoint()
def main(fixtures: str, output: str, cpp_beam_size: int = 5):
    from whisper_runtime_validation import load_cases, protocol_coverage_failures
    if cpp_beam_size not in (1, 5):
        raise ValueError("Use beam size 1 (greedy) or 5 for this comparison")
    cases, long_case = load_cases(Path(fixtures))
    result = validate.remote(cases, long_case, ENGINE, VAD_ENABLED, cpp_beam_size)
    if "default" in result:
        result["default"]["protocol_coverage_failures"] = protocol_coverage_failures(result["default"], cases, long_case)
    Path(output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in ("default", "beam5", "server_log_tail")}))
    if ("default" not in result or result.get("validation_error")
            or result.get("startup_error") is not None
            or result.get("default", {}).get("protocol_coverage_failures")):
        raise SystemExit("Protocol/source-coverage gate failed; inspect the saved result")
