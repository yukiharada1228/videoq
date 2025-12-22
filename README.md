# VideoQ

VideoQ is a web application that provides video transcription (Whisper) and AI chat (RAG) over those transcripts.

## Overview

When a user uploads a video, transcription runs automatically in the background. Once completed, the user can ask questions grounded in the video (and its scenes).

## Key Features

- **Authentication**: JWT via HttpOnly cookies (email verification + password reset)
- **Video upload**: supports multiple formats
- **Upload limit**: per-user limit via `User.video_limit` (`NULL` = unlimited, `0` = disabled)
- **Automatic transcription**: async processing via Celery (Whisper API)
- **AI chat**: RAG using pgvector (OpenAI API)
- **Group management**: group multiple videos and reorder them
- **Sharing**: share groups via share token (guest viewing/chat)
- **Protected media delivery**: served only with auth/share token

## Architecture (Docker Compose)

The default local setup (see `docker-compose.yml`) is:

- **nginx**: entry point (`80`) / routes `/api` to backend and everything else to frontend
- **frontend**: Vite-built React SPA (container port `80`)
- **backend**: Django REST API (container port `8000`)
- **celery-worker**: async jobs (transcription, vector indexing, etc.)
- **postgres**: PostgreSQL 17 + pgvector
- **redis**: Celery broker / result backend

## Directory Structure (Excerpt)

```
videoq/
├── backend/          # Django / DRF / Celery
├── frontend/         # Vite + React + React Router
├── docs/             # Design docs (Mermaid diagrams)
├── docker-compose.yml
└── nginx.conf
```

## Tech Stack (Current)

### Backend

- Django / Django REST Framework
- Celery + Redis
- PostgreSQL 17 + pgvector
- OpenAI API (Whisper / Chat / Embeddings)
- Storage: local (`backend/media`) or S3 (optional)
- Dependency management: `uv` (`backend/pyproject.toml`)

### Frontend

- Vite + React + TypeScript
- React Router (SPA)
- i18n: i18next + react-i18next (also provides `/:locale/...` routes)
- Tailwind CSS / Radix UI / react-hook-form / zod, etc.

## Running (Docker Compose)

### 1) Environment variables

Copy `/.env.example` to create `/.env`.

```bash
cp .env.example .env
```

Important variables (minimum):

- `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `ENABLE_SIGNUP`
- `FRONTEND_URL` (used in email links; default is `http://localhost`)
- `VITE_API_URL` (**used at frontend build time**; with the default Nginx setup, `/api` is recommended)

### 2) Start

```bash
docker compose up --build -d
```

### 3) First-time setup

```bash
docker compose exec backend uv run python manage.py migrate
docker compose exec backend uv run python manage.py collectstatic
docker compose exec backend uv run python manage.py createsuperuser
```

### 4) URLs

- **Frontend**: `http://localhost`
- **Backend API**: `http://localhost/api`
- **Admin**: `http://localhost/api/admin`
- **Swagger**: `http://localhost/api/docs/`
- **ReDoc**: `http://localhost/api/redoc/`

## Important Note (OpenAI API Key)

This app assumes **OpenAI API keys are configured per user**.

- **Normal usage**: each user registers their API key in Settings (saved encrypted in DB)
- **Chat via shared link**: uses the **group owner's API key**

Related: `docs/architecture/prompt-engineering.md`

## Development Notes (Optional)

### Using `vite dev` for frontend-only local development

`frontend/vite.config.ts` proxies `/api` to `VITE_API_URL` (or `http://localhost:8000` when unspecified).

### Common commands

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend celery-worker frontend nginx
docker compose down
 docker compose down -v  # Deletes all data (caution)
```

