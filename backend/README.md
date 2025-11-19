# Ask Video Backend

Django REST API application providing video transcription and chat features.

## Overview

This backend provides:
- User authentication (JWT with email verification and password reset)
- Video upload and management
- Automatic transcription using Whisper API (Celery background processing)
- Video group management
- AI chat with RAG (Retrieval-Augmented Generation) support
- Share token functionality
- Protected media delivery

## Features

- **User Authentication**: JWT-based auth with email verification and password reset
- **Video Upload**: Supports multiple video/audio formats with automatic conversion
- **Automatic Transcription**: Whisper API with Celery background processing
- **Video Group Management**: Organize multiple videos into groups
- **AI Chat**: RAG-enabled chat using OpenAI API
- **Sharing**: Share video groups via share tokens
- **Protected Media Delivery**: Secure media delivery via authentication

## Setup

**This project is designed to run with Docker Compose.** For setup instructions, see the root [README.md](../README.md).

### Quick Start with Docker Compose

```bash
# From project root
docker-compose up --build -d

# Run migrations
docker-compose exec backend uv run python manage.py migrate

# Create superuser (first time only)
docker-compose exec backend uv run python manage.py createsuperuser
```

### Local Development (Optional)

If you need to run the backend locally without Docker:

1. **Install dependencies** (requires Python 3.11+ and [uv](https://github.com/astral-sh/uv)):
```bash
uv sync
```

2. **Install ffmpeg** (required for video format conversion):
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

3. **Start Redis** (required for Celery):
```bash
# Using Docker
docker run -d -p 6379:6379 redis:alpine

# Or if installed locally
redis-server
```

4. **Configure environment variables** (create `.env` file):
```bash
SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://user:password@localhost:5432/ask_video
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
# ... other required variables (see root README)
```

5. **Run database migrations**:
```bash
uv run python manage.py migrate
```

6. **Start services**:
```bash
# Terminal 1 - Celery worker
uv run celery -A ask_video worker --loglevel=info

# Terminal 2 - Django dev server
uv run python manage.py runserver
```

**Note:** For production and most development scenarios, Docker Compose is recommended.

## API Usage

### Authentication

1. **Sign up** (email verification required):
```bash
POST /api/auth/signup/
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "pass1234"
}
```

2. **Verify email** (use token sent via email):
```bash
POST /api/auth/verify-email/
{
  "uid": "<USER_ID>",
  "token": "<VERIFICATION_TOKEN>"
}
```

3. **Login**:
```bash
POST /api/auth/login/
{
  "username": "alice",
  "password": "pass1234"
}
```

4. **Get current user info:**
```bash
GET /api/auth/me/
Authorization: Bearer <access_token>
```

### Video Management

**Upload a video** (automatically starts transcription):
```bash
POST /api/videos/
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

file: <video_file>
title: "Video title"
description: "Description"
```

**Supported file formats:**
- Audio: `.flac`, `.m4a`, `.mp3`, `.mpga`, `.oga`, `.ogg`, `.wav`, `.webm`
- Video: `.mp4`, `.mpeg`, `.webm`, `.mov` (auto-converted to MP3 via ffmpeg)

**Check transcription status:**
```bash
GET /api/videos/{id}/
Authorization: Bearer <access_token>
```

Response includes:
- `status`: `pending`, `processing`, `completed`, or `error`
- `transcript`: Transcription text (when completed)
- `error_message`: Error details (if status is `error`)

### Video Groups

**Create a group:**
```bash
POST /api/videos/groups/
Authorization: Bearer <access_token>
{
  "name": "Group name",
  "description": "Description"
}
```

**Add videos to group:**
```bash
POST /api/videos/groups/{group_id}/videos/
Authorization: Bearer <access_token>
{
  "video_ids": [1, 2, 3]
}
```

**Reorder videos in group:**
```bash
POST /api/videos/groups/{group_id}/reorder/
Authorization: Bearer <access_token>
{
  "video_ids": [3, 1, 2]
}
```

**Create share link:**
```bash
POST /api/videos/groups/{group_id}/share/
Authorization: Bearer <access_token>
```

### AI Chat (RAG-enabled)

**Send a chat message:**
```bash
POST /api/chat/
Authorization: Bearer <access_token>
{
  "group_id": 10,
  "messages": [
    {"role": "user", "content": "Summarize the key points."}
  ]
}
```

**Get chat history:**
```bash
GET /api/chat/history/?group_id=10
Authorization: Bearer <access_token>
```

**Export chat history (CSV):**
```bash
GET /api/chat/history/export/?group_id=10
Authorization: Bearer <access_token>
```

**Notes:**
- Chat uses RAG (Retrieval-Augmented Generation) to ground answers in video transcripts
- Only the latest `user` message in `messages` is used
- Do not send `system` messages; the backend constructs the system prompt internally
- Chat is also available with share tokens (use `share_token` query parameter)

For complete API documentation, see the root [README.md](../README.md).

## Celery Configuration

Celery is used for background task processing (primarily video transcription).

### Environment Variables

Configure Celery using environment variables:

```bash
# Redis connection URLs (defaults shown)
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0

# Task timeouts
CELERY_TASK_TIME_LIMIT=1800      # 30 minutes (hard limit)
CELERY_TASK_SOFT_TIME_LIMIT=1500 # 25 minutes (soft limit)
```

### Running Celery Worker

**In Docker Compose** (recommended):
```bash
# Celery worker runs automatically as a service
docker-compose up celery-worker

# Check logs
docker-compose logs -f celery-worker
```

**Locally:**
```bash
uv run celery -A ask_video worker --loglevel=info
```

### Tasks

Main Celery tasks:
- `app.tasks.transcribe_video`: Transcribes video using Whisper API
- Tasks are automatically triggered when videos are uploaded

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

## Development

### Docker Compose Environment (Recommended)

```bash
# Run tests
docker-compose exec backend uv run python manage.py test

# Create migrations
docker-compose exec backend uv run python manage.py makemigrations

# Apply migrations
docker-compose exec backend uv run python manage.py migrate

# Open Django shell
docker-compose exec backend uv run python manage.py shell

# View logs
docker-compose logs -f backend celery-worker
```

**Note:** In Docker, always run Python commands via `uv run`.

### Local Development

If running locally:
```bash
# Run tests
uv run python manage.py test

# Create migrations
uv run python manage.py makemigrations

# Apply migrations
uv run python manage.py migrate

# Open Django shell
uv run python manage.py shell
```

## Troubleshooting

### Celery worker does not receive tasks

1. **Check Redis is running:**
```bash
# In Docker
docker-compose ps redis
docker-compose exec redis redis-cli ping  # Should return PONG

# Locally
redis-cli ping
```

2. **Check Celery worker is running:**
```bash
# In Docker
docker-compose ps celery-worker
docker-compose logs celery-worker

# Locally
ps aux | grep celery
```

3. **Verify registered tasks:**
```bash
# In Docker
docker-compose exec backend uv run celery -A ask_video inspect registered

# Locally
uv run celery -A ask_video inspect registered
```

4. **Check logs for errors:**
```bash
# In Docker
docker-compose logs -f celery-worker

# Locally
# Check terminal output where Celery worker is running
```

### Transcription task fails

1. **Ensure OpenAI API key is configured (system administrator):**
   - Set `OPENAI_API_KEY` environment variable in your deployment configuration
   - This is a system-level setting, not user-configurable

2. **Validate API key:**
   - Test the API key directly with OpenAI API
   - Ensure it has access to Whisper API

3. **Check video file exists:**
```bash
# In Django shell
from app.models import Video
video = Video.objects.get(id=...)
print(video.file.path)  # Check file path
```

4. **Inspect error details:**
```bash
# In Django shell
video = Video.objects.get(id=...)
print(video.status)        # Should be 'error'
print(video.error_message) # Error details
```

### Database connection errors

1. **Check PostgreSQL is running:**
```bash
docker-compose ps postgres
```

2. **Test database connection:**
```bash
docker-compose exec backend uv run python manage.py dbshell
```

3. **Check environment variables:**
   - Ensure `DATABASE_URL` or `POSTGRES_*` variables are set correctly

For more troubleshooting, see the root [README.md](../README.md).

