# SQS worker Lambda container image.
FROM public.ecr.aws/lambda/python:3.12

# FFmpeg / ffprobe for uploaded-video transcription
RUN dnf install -y tar xz \
  && curl -fsSL -o /tmp/ffmpeg.tar.xz \
       https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
  && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp \
  && cp /tmp/ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ \
  && cp /tmp/ffmpeg-*-amd64-static/ffprobe /usr/local/bin/ \
  && rm -rf /tmp/ffmpeg* \
  && dnf clean all

COPY pyproject.toml README.md ./
COPY worker_python ./worker_python
COPY handler.py ./

RUN pip install --no-cache-dir .

# Lambda handler: handler.handler
CMD ["handler.handler"]
