FROM python:3.12-slim

ARG APP_HOME=/app
WORKDIR ${APP_HOME}

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

RUN python -m nltk.downloader -d /usr/local/nltk_data averaged_perceptron_tagger_eng punkt_tab

COPY . .

EXPOSE 8000

CMD ["gunicorn", "videoq.asgi:application", "-k", "uvicorn_worker.UvicornWorker", "--bind", "0.0.0.0:8000"]