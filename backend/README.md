# Ask Video Backend

Django REST API application providing video transcription and chat features.

## Features

- User authentication (JWT)
- Video upload
- Transcription with Whisper API (Celery background processing)
- Video group management
- Chat with ChatGPT

## Setup

### 1. Install dependencies

```bash
uv sync
```

### 1.5. Install ffmpeg

Files in formats that Whisper API does not support (e.g., MOV) are automatically converted to MP3. You need `ffmpeg` installed.

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download and install from https://ffmpeg.org/download.html
```

### 2. Run database migrations

```bash
python manage.py migrate
```

### 3. Start Redis

Celery requires Redis.

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or if Redis is installed locally
redis-server
```

### 4. Start Celery worker

```bash
# Terminal 1 - start Celery worker
celery -A ask_video worker --loglevel=info

# Terminal 2 - start Django dev server
python manage.py runserver
```

**Using uv:**
```bash
uv run celery -A ask_video worker --loglevel=info
```

**Note:** This project is designed to be used with Docker Compose. For local development environment setup, see the root README.

## Troubleshooting

### When Celery tasks do not execute

1. **Verify the Celery worker is running**
```bash
ps aux | grep celery
```

2. **Inspect registered tasks**
```bash
uv run celery -A ask_video inspect registered
```

3. **Ensure correct app name**
Start with the new config (`-A ask_video`), not the old (`-A config`).

4. **Check logs**
```bash
# Inspect errors in worker logs
uv run celery -A ask_video worker --loglevel=debug
```

## Usage

### 1. Sign up and set API key

- Sign up with `POST /api/auth/signup/` (email verification required)
- Verify email with `POST /api/auth/verify-email/`
- Set OpenAI API key with `PATCH /api/auth/me/` (stored encrypted in `encrypted_openai_api_key`)

### 2. Upload a video

```bash
POST /api/videos/
{
  "file": <video_file>,
  "title": "Video title",
  "description": "Description"
}
```

Uploading a video automatically starts the transcription process.

**Supported file types:**
- Audio: `.flac`, `.m4a`, `.mp3`, `.mpga`, `.oga`, `.ogg`, `.wav`, `.webm`
- Video: `.mp4`, `.mpeg`, `.webm`, `.mov` (auto-converted to MP3 via ffmpeg)
- **Other formats (e.g., MOV)**: auto-converted to MP3 via ffmpeg

You can check processing status via the `status` field:
- `pending`: Waiting
-- `processing`: In progress
- `completed`: Completed
- `error`: Error

### 3. Check transcription result

```bash
GET /api/videos/{id}/
```

Transcription is stored in the `transcript` field.

### 4. Manage video groups

```bash
# Create a group
POST /api/videos/groups/
{
  "name": "Group name",
  "description": "Description"
}

# Add videos to a group
POST /api/videos/groups/{group_id}/videos/
{
  "video_ids": [1, 2, 3]
}
```

### 5. Chat

```bash
# Send a chat (RAG-enabled)
POST /api/chat/
{
  "group_id": 10,
  "messages": [
    {"role": "user", "content": "Your question"}
  ]
}

# Get chat history
GET /api/chat/history/?group_id=10
```

## Celery Configuration

### Environment variables

You can configure Celery using the following variables:

```bash
# Redis connection URLs
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# Timeouts
CELERY_TASK_TIME_LIMIT=1800  # 30 minutes
CELERY_TASK_SOFT_TIME_LIMIT=1500  # 25 minutes
```

### Production

In production, run Redis on a separate server and set appropriate URLs:

```python
# settings.py
CELERY_BROKER_URL = os.environ.get(
    "CELERY_BROKER_URL", "redis://your-redis-server:6379/0"
)
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND", "redis://your-redis-server:6379/0"
)
```

## Directory Structure

```
backend/
├── app/
│   ├── tasks.py          # Celery tasks (transcription)
│   ├── celery_config.py  # Celery app configuration
│   ├── models.py         # Data models
│   ├── auth/             # Auth (views, serializers, urls, tests)
│   ├── video/            # Video management (views, serializers, urls, tests)
│   ├── chat/             # Chat (views, serializers, urls, services)
│   ├── common/           # Common (authentication, permissions, responses)
│   ├── media/            # Media delivery (views)
│   ├── scene_otsu/       # Scene detection
│   ├── utils/            # Utilities (encryption, vector_manager, task_helpers, email, etc.)
│   └── migrations/       # Database migrations
├── ask_video/
│   ├── settings.py       # Django settings (incl. Celery)
│   ├── urls.py           # URL configuration
│   ├── wsgi.py           # WSGI
│   └── asgi.py           # ASGI
├── media/                # Uploaded media files
├── pyproject.toml        # Python dependencies (uv)
├── uv.lock               # uv dependency lock file
├── manage.py             # Django management script
└── Dockerfile            # Backend Docker image
```

## Troubleshooting

### Celery worker does not receive tasks

1. Ensure Redis is running
2. Ensure the Celery worker is healthy
3. Check logs for errors

### Transcription task fails

1. Ensure the user’s OpenAI API key is set (`encrypted_openai_api_key` in `/api/auth/me/`)
2. Validate the API key works
3. Ensure the video file exists
4. Inspect details in the `error_message` field

### Development in Docker

This project assumes Docker Compose. See the root README for details.

```bash
# Example commands in Docker environment
docker-compose exec backend uv run python manage.py migrate
docker-compose exec backend uv run python manage.py shell
docker-compose exec backend uv run celery -A ask_video worker --loglevel=info
```

