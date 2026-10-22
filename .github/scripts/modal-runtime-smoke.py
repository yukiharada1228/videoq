"""Exercise native Whisper imports and decoding in the actual Modal Python image."""
import io
import json
from pathlib import Path
import sys
import wave

root = Path("/workspace")
expected = json.loads((root / ".github/runtime-versions.json").read_text())["python"]
assert ".".join(map(str, sys.version_info[:3])) == expected

import av
import ctranslate2
import numpy
import onnxruntime
from faster_whisper.audio import decode_audio
from faster_whisper import WhisperModel

audio = io.BytesIO()
with wave.open(audio, "wb") as stream:
    stream.setnchannels(1)
    stream.setsampwidth(2)
    stream.setframerate(16000)
    stream.writeframes(b"\x00\x00" * 16000)
decoded = decode_audio(io.BytesIO(audio.getvalue()))
assert decoded.shape == (16000,)
assert numpy.isfinite(decoded).all()
assert "int8" in ctranslate2.get_supported_compute_types("cpu")
print(f"Modal Python {expected}: native Whisper/AV/ONNX imports and audio decoding passed")
