FROM ghcr.io/astral-sh/uv:0.8.22-python3.12-trixie-slim

ARG APP_HOME=/app
WORKDIR ${APP_HOME}

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock ./

RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 8000

CMD [ "uv", "run", "gunicorn", "ask_video.asgi:application", "-k", "uvicorn_worker.UvicornWorker", "--bind", "0.0.0.0:8000"]