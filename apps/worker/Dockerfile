# SQS worker Lambda container image (linux/arm64).
FROM public.ecr.aws/lambda/python:3.12

# Architecture for johnvansickle static ffmpeg (buildx sets TARGETARCH).
ARG TARGETARCH=arm64

# FFmpeg / ffprobe for uploaded-video audio extraction only.
# Static build keeps the image free of shared-lib drag; tar/xz removed after install.
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64|x86_64) FFARCH=amd64 ;; \
    arm64|aarch64) FFARCH=arm64 ;; \
    *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  dnf install -y tar xz; \
  curl -fsSL -o /tmp/ffmpeg.tar.xz \
    "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${FFARCH}-static.tar.xz"; \
  tar -xJf /tmp/ffmpeg.tar.xz -C /tmp; \
  cp /tmp/ffmpeg-*-${FFARCH}-static/ffmpeg /usr/local/bin/; \
  cp /tmp/ffmpeg-*-${FFARCH}-static/ffprobe /usr/local/bin/; \
  rm -rf /tmp/ffmpeg*; \
  dnf remove -y tar xz; \
  dnf clean all; \
  ffmpeg -version >/dev/null; \
  ffprobe -version >/dev/null

COPY pyproject.toml README.md ./
COPY worker_python ./worker_python
COPY handler.py ./

RUN pip install --no-cache-dir .

# Lambda handler: handler.handler
CMD ["handler.handler"]
