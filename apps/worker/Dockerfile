# SQS worker Lambda container image (linux/arm64).
FROM public.ecr.aws/lambda/python:3.14

# buildx sets TARGETARCH; both binaries target glibc >= 2.28 (Lambda uses 2.34).
ARG TARGETARCH=arm64
ARG FFMPEG_BUILD=autobuild-2026-09-30-13-08
ARG FFMPEG_VERSION=n9.0.2-17-g2a571b6068

# FFmpeg / ffprobe for uploaded-video audio and frame extraction.
# Pin a retained monthly BtbN build and verify the architecture-specific archive.
# These LGPL builds are linked from https://ffmpeg.org/download.html.
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64|x86_64) FFARCH=linux64; FFSHA=2d41cbea0ca1a15029b638330740f78d6f5aeb062355bf425433fc938705350a ;; \
    arm64|aarch64) FFARCH=linuxarm64; FFSHA=b8cc09200780d37801179c803f597c22440b0b06c556addd2e6a07b27475ce37 ;; \
    *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  dnf install -y tar xz libstdc++; \
  curl -fsSL -o /tmp/ffmpeg.tar.xz \
    "https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_BUILD}/ffmpeg-${FFMPEG_VERSION}-${FFARCH}-lgpl-9.0.tar.xz"; \
  echo "${FFSHA}  /tmp/ffmpeg.tar.xz" | sha256sum -c -; \
  tar -xJf /tmp/ffmpeg.tar.xz -C /tmp; \
  cp /tmp/ffmpeg-${FFMPEG_VERSION}-${FFARCH}-lgpl-9.0/bin/ffmpeg /usr/local/bin/; \
  cp /tmp/ffmpeg-${FFMPEG_VERSION}-${FFARCH}-lgpl-9.0/bin/ffprobe /usr/local/bin/; \
  rm -rf /tmp/ffmpeg*; \
  dnf remove -y tar xz; \
  dnf clean all; \
  ffmpeg -version >/dev/null; \
  ffprobe -version >/dev/null

# Lambda base images can lag Amazon Linux security advisories.
RUN dnf upgrade -y --releasever=latest && dnf clean all

COPY pyproject.toml README.md ./
COPY worker_python ./worker_python
COPY handler.py ./

RUN pip install --no-cache-dir .

# Lambda handler: handler.handler
CMD ["handler.handler"]
