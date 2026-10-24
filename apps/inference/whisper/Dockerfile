FROM ghcr.io/astral-sh/uv:0.13.5@sha256:32a7bb39b496babbd997b0a39a4d66c126bdaf5661b302bf6f06abda8deca6ff AS uv
FROM python:3.12.15-slim-trixie@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704 AS native
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake curl ca-certificates xz-utils && rm -rf /var/lib/apt/lists/*
# Portable CPU build: runtime dispatch selects a supported ISA, including FP16.
# No CUDA/Metal, host-only CPU flags or runtime executable downloads.
ARG WHISPER_CPP_REVISION=d1be6fde11ac6e0407606b4e42fe72d34add8037
ARG WHISPER_CPP_SHA256=645445da884df6dbd52b30f82d7be7c01d1767c938714e477e786b88d529e9f4
RUN curl -fsSL "https://github.com/ggml-org/whisper.cpp/archive/${WHISPER_CPP_REVISION}.tar.gz" -o /tmp/source.tar.gz \
    && echo "$WHISPER_CPP_SHA256  /tmp/source.tar.gz" | sha256sum -c - \
    && mkdir /src && tar -xzf /tmp/source.tar.gz --strip-components=1 -C /src \
    && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DGGML_BACKEND_DIR=/usr/local/lib -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build /src/build -j2
RUN python - <<'PY'
from pathlib import Path
import shutil
Path("/native-libs").mkdir()
for path in Path("/src/build").rglob("*.so*"):
    if path.is_file(): shutil.copyfile(path, Path("/native-libs") / path.name)
PY
ARG TARGETARCH
ARG FFMPEG_BUILD=autobuild-2026-09-30-13-08
ARG FFMPEG_VERSION=n9.0.2-17-g2a571b6068
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) archive_arch=linux64; archive_sha=2d41cbea0ca1a15029b638330740f78d6f5aeb062355bf425433fc938705350a ;; \
      arm64) archive_arch=linuxarm64; archive_sha=b8cc09200780d37801179c803f597c22440b0b06c556addd2e6a07b27475ce37 ;; \
      *) exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_BUILD}/ffmpeg-${FFMPEG_VERSION}-${archive_arch}-lgpl-9.0.tar.xz" -o /tmp/ffmpeg.tar.xz; \
    echo "$archive_sha  /tmp/ffmpeg.tar.xz" | sha256sum -c -; \
    mkdir /ffmpeg; tar -xJf /tmp/ffmpeg.tar.xz --strip-components=1 -C /ffmpeg

FROM python:3.12.15-slim-trixie@sha256:a0f57064cbdcd6285fa45f51237ab0b35ea8ebaed06a1f5973e89e19dfb86704 AS dependencies
COPY --from=uv /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev && python -m pip uninstall --yes pip && rm /usr/local/bin/uv
# Distroless already contains libc/libstdc++. Record every added native library.
RUN python - <<'PY'
import pathlib, shutil, sysconfig
root = pathlib.Path('/extra')
libraries, status, licenses = (root / name for name in ('lib', 'status.d', 'licenses'))
for directory in (libraries, status, licenses): directory.mkdir(parents=True)
packages = {'libbz2-1.0': 'libbz2.so.1.0', 'liblzma5': 'liblzma.so.5',
            'libffi8': 'libffi.so.8', 'libsqlite3-0': 'libsqlite3.so.0',
            'zlib1g': 'libz.so.1', 'libgomp1': 'libgomp.so.1'}
records = pathlib.Path('/var/lib/dpkg/status').read_text().split('\n\n')
libdir = pathlib.Path('/usr/lib') / sysconfig.get_config_var('MULTIARCH')
for package, soname in packages.items():
    shutil.copyfile(libdir / soname, libraries / soname)
    record = next(record for record in records if f'Package: {package}\n' in record)
    (status / package).write_text(record + '\n')
    shutil.copyfile(f'/usr/share/doc/{package}/copyright', licenses / f'{package}.copyright')
for pattern in ('readline*.so', '_uuid*.so', '_tkinter*.so'):
    for module in pathlib.Path('/usr/local/lib/python3.12/lib-dynload').glob(pattern): module.unlink()
PY

FROM gcr.io/distroless/cc-debian13:nonroot@sha256:83b9b50586253821cf63ffcec87d3d94265a093ad30da232039af962dd8f4edf
COPY --from=dependencies /usr/local /usr/local
COPY --from=dependencies /extra/lib/ /usr/local/lib/
COPY --from=dependencies /extra/status.d/ /var/lib/dpkg/status.d/
COPY --from=dependencies /extra/licenses/ /usr/share/doc/videoq-native/
COPY --from=dependencies /app/.venv /app/.venv
COPY --from=native /src/build/bin/whisper-server /usr/local/bin/whisper-server
COPY --from=native /native-libs/ /usr/local/lib/
COPY --from=native /src/LICENSE /usr/share/doc/whisper.cpp/LICENSE
COPY --from=native /ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=native /ffmpeg/doc/ /usr/share/doc/ffmpeg/
WORKDIR /app
COPY server.py provision.py ./
USER 10001:10001
ENV PATH="/app/.venv/bin:/usr/local/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 LD_LIBRARY_PATH=/usr/local/lib
ENTRYPOINT []
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
