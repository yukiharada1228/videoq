"""Opt-in actual CPU image check with a public clip and no serving-network egress."""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
from uuid import uuid4

import pytest

IMAGE = os.environ.get("LOCAL_WHISPER_CONTAINER_IMAGE")
REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1"
MODEL = "ggml-small-q5_1.bin"
DIGEST = "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"


@pytest.mark.skipif(not IMAGE, reason="LOCAL_WHISPER_CONTAINER_IMAGE enables the actual Docker/runtime test")
def test_cpu_image_transcribes_public_speech_and_silence_offline(record_property):
    def docker(*args, timeout=180):
        try:
            return subprocess.check_output(["docker", *args], text=True, stderr=subprocess.STDOUT, timeout=timeout).strip()
        except subprocess.CalledProcessError as error:
            raise AssertionError(f"Docker {args[0]} failed: {error.output[-6000:]}") from error

    name = "videoq-whisper-test-" + uuid4().hex
    started = network_created = volume_created = False
    fixtures = Path(__file__).with_name("fixtures")
    case = json.loads((fixtures / "fleurs-ja-00.json").read_text())
    audio = (fixtures / case["file"]).read_bytes()
    assert hashlib.sha256(audio).hexdigest() == case["sha256"]
    spec = importlib.util.spec_from_file_location("whisper_metrics", Path(__file__).parents[3] / "worker/scripts/whisper_runtime_validation.py")
    metrics = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(metrics)
    mount = f"type=volume,src={name},dst=/models"
    try:
        docker("volume", "create", name)
        volume_created = True
        docker("run", "--rm", "--user", "0:0", "--entrypoint", "python", "--mount", mount, IMAGE,
               "-c", "import os; os.chown('/models',10001,10001); os.chmod('/models',0o700)")
        # Provision and serve with the same UID; the cache is owner-only.
        # No model downloads are permitted in the serving network.
        docker("run", "--rm", "--entrypoint", "python",
               "--mount", mount, "-e", "HF_HUB_OFFLINE=0", "-e", "MODEL_REPO=ggerganov/whisper.cpp",
               "-e", "MODEL_REVISION=" + REVISION, "-e", "MODEL_FILE=" + MODEL,
               "-e", "MODEL_SHA256=" + DIGEST, IMAGE, "provision.py", timeout=600)
        docker("network", "create", "--internal", name)
        network_created = True
        docker("run", "--detach", "--name", name, "--network", name, "--cpus", "2", "--memory", "4g",
               "--mount", mount + ",readonly", IMAGE)
        started = True
        docker("cp", str(fixtures / case["file"]), f"{name}:/tmp/public-speech.mp3")
        engine_args = ["whisper-server", "--model", f"/models/{REVISION}/{MODEL}",
                       "--host", "127.0.0.1", "--port", "8081", "--inference-path", "/v1/audio/transcriptions",
                       "--language", "auto", "--threads", "2", "--beam-size", "5", "--no-gpu"]
        launch = "import os; f=open('/tmp/whisper-engine.log','wb'); os.dup2(f.fileno(),1); os.dup2(f.fileno(),2); os.execvp('whisper-server'," + repr(engine_args) + ")"
        docker("exec", "--detach", name, "python", "-c", launch)
        # Client stays in the same isolated network namespace. No host ports.
        probe = r'''import httpx, io, json, os, socket, time, wave
assert os.geteuid() == 10001
assert os.stat("/models").st_mode & 0o077 == 0
base = "http://127.0.0.1:8080"
with httpx.Client(timeout=2, trust_env=False) as client:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        try:
            if client.get(base + "/health").status_code == 200: break
        except httpx.HTTPError: pass
        time.sleep(.25)
    else:
        from pathlib import Path
        path = Path("/tmp/whisper-engine.log")
        raise RuntimeError("Gateway/engine failed readiness: " + (path.read_text()[-4000:] if path.exists() else "No engine log"))
try: socket.create_connection(("1.1.1.1", 443), timeout=2)
except OSError: pass
else: raise RuntimeError("External serving egress was allowed")
data = {"model":"whisper-local", "response_format":"verbose_json", "timestamp_granularities[]":"segment"}
with httpx.Client(timeout=120, trust_env=False) as client:
    started = time.monotonic()
    with open("/tmp/public-speech.mp3", "rb") as audio:
        speech = client.post(base + "/v1/audio/transcriptions", data=data, files={"file":("speech.mp3", audio)})
    speech.raise_for_status()
    elapsed = time.monotonic() - started
    silence = io.BytesIO()
    with wave.open(silence, "wb") as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(16000)
        output.writeframes(bytes(20*16000*2))
    empty = client.post(base + "/v1/audio/transcriptions", data=data, files={"file":("silence.wav", silence.getvalue())})
    empty.raise_for_status()
print(json.dumps({"speech":speech.json(), "silence":empty.json(), "elapsed_seconds":elapsed}))
'''
        observed = json.loads(docker("exec", name, "python", "-c", probe, timeout=240))
        result = observed["speech"]
        assessment = metrics.assess_response(result, case)
        record_property("japanese_clip_cer", assessment["cer"])
        record_property("speech_elapsed_seconds", observed["elapsed_seconds"])
        assert not assessment["errors"] and assessment["cer"] < .5
        assert result["segments"]
        assert all(math.isfinite(row["start"]) and 0 <= row["start"] < row["end"] <= result["duration"] for row in result["segments"])
        assert observed["silence"]["segments"] == [] and observed["silence"]["text"] == ""
    finally:
        if started:
            docker("rm", "--force", name)
        if network_created:
            docker("network", "rm", name)
        if volume_created:
            docker("volume", "rm", name)
