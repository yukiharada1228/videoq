# Ask Video

A web application that provides video transcription and AI chat features.

## Overview

This application offers video upload, automatic transcription, and AI chat. When a user uploads a video, transcription runs automatically in the background, and the user can ask questions about the content via AI chat.

### Key Features

- **User Authentication**: JWT-based auth (email verification and password reset supported)
- **Video Upload**: Supports multiple video formats
- **Automatic Transcription**: Whisper API with Celery background processing
- **AI Chat**: Q&A about video content using the OpenAI API (RAG-enabled)
- **Video Group Management**: Organize multiple videos into groups
- **Sharing**: Share video groups via share tokens
- **Protected Media Delivery**: Secure media delivery via authentication

## Project Structure

```
ask-video/
├── backend/                    # Django REST Framework backend
│   ├── app/                     # Main application
│   │   ├── auth/                # Auth features (views, serializers, urls, tests)
│   │   ├── video/               # Video management (views, serializers, urls, tests)
│   │   ├── chat/                # Chat (views, serializers, urls, services)
│   │   ├── common/              # Common (authentication, permissions, responses)
│   │   ├── media/               # Media delivery (views)
│   │   ├── scene_otsu/          # Scene detection
│   │   ├── utils/               # Utilities (encryption, vector_manager, task_helpers, email, etc.)
│   │   ├── migrations/          # Database migrations
│   │   ├── models.py            # Data models (User, Video, VideoGroup, ChatLog, etc.)
│   │   ├── tasks.py             # Celery tasks (transcription, etc.)
│   │   └── celery_config.py     # Celery configuration
│   ├── ask_video/               # Django project settings
│   │   ├── settings.py          # Django settings
│   │   ├── urls.py              # URL settings
│   │   ├── wsgi.py              # WSGI
│   │   └── asgi.py              # ASGI
│   ├── media/                   # Uploaded media files
│   ├── pyproject.toml           # Python dependencies (uv)
│   ├── uv.lock                  # uv dependency lock file
│   ├── manage.py                # Django management script
│   ├── Dockerfile               # Backend Docker image
│   └── README.md                # Backend README
├── frontend/                    # Next.js + TypeScript frontend
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # Home page
│   │   ├── login/               # Login page
│   │   ├── signup/              # Sign-up page
│   │   │   └── check-email/      # Waiting for email confirmation page
│   │   ├── verify-email/         # Email verification page
│   │   ├── forgot-password/     # Password reset request page
│   │   ├── reset-password/       # Password reset page
│   │   ├── settings/            # Settings page
│   │   ├── videos/              # Video pages
│   │   │   ├── page.tsx         # Video list page
│   │   │   ├── [id]/            # Video detail page
│   │   │   └── groups/          # Video group pages
│   │   │       └── [id]/        # Video group detail page
│   │   └── share/               # Share pages
│   │       └── [token]/         # Share token page
│   ├── components/              # React components
│   │   ├── auth/                # Auth components
│   │   ├── video/               # Video components
│   │   ├── chat/                # Chat components
│   │   ├── layout/              # Layout components
│   │   ├── common/              # Common components
│   │   └── ui/                  # UI components (shadcn/ui)
│   ├── hooks/                   # Custom hooks (useAuth, useVideos, useAsyncState, etc.)
│   ├── lib/                     # Libraries/utilities (api, errorUtils, etc.)
│   ├── package.json             # Node.js dependencies
│   ├── package-lock.json        # npm lockfile
│   ├── Dockerfile               # Frontend Docker image
│   └── README.md                # Frontend README
├── docker-compose.yml           # Docker Compose config
├── nginx.conf                   # Nginx config
└── README.md                    # This file
```

## Tech Stack

### Backend

#### Frameworks / APIs
- **Django** (>=5.2.7) - Web framework
- **Django REST Framework** (>=3.16.1) - REST API
- **django-rest-framework-simplejwt** (>=5.5.1) - JWT auth
- **django-cors-headers** (>=4.9.0) - CORS settings
- **django-anymail** (>=13.1) - Email sending (verification, password reset)

#### Servers / WSGI
- **Gunicorn** (>=23.0.0) - WSGI server
- **Uvicorn** (>=0.38.0) - ASGI server
- **uvicorn-worker** (>=0.4.0) - Uvicorn worker

#### Background Processing
- **Celery** (>=5.5.3) - Background task processing
- **Redis** (>=7.0.0) - Celery broker and queue management

#### Database
- **PostgreSQL** (17 with pgvector) - Relational database
- **psycopg2-binary** (>=2.9.11) - PostgreSQL adapter
- **dj-database-url** (>=3.0.1) - Database URL parser
- **pgvector** (>=0.3.0) - PostgreSQL extension (vector database)

#### AI / ML
- **OpenAI** (>=2.6.1) - OpenAI API client (Whisper API, ChatGPT)
- **LangChain** (>=1.0.2) - LLM app framework
- **langchain-openai** (>=1.0.1) - LangChain OpenAI integration
- **langchain-postgres** (>=0.0.16) - LangChain PostgreSQL integration
- **numpy** (>=2.0.0) - Numerical computing library
- **scikit-learn** (>=1.7.2) - Machine learning library

#### Video / Audio Processing
- **ffmpeg** - Media conversion tool (installed at system/Docker level)

#### Storage
- **django-storages** (>=1.14.6) - Django storage backends (S3)
+- **boto3** (>=1.40.64) - AWS SDK for Python (S3, etc.)

#### Security / Encryption
- **cryptography** (>=46.0.3) - Encryption library (API key encryption)

#### Package Management
- **uv** - Fast Python package manager

### Frontend

#### Frameworks / Runtime
- **Next.js** (16.0.0) - React framework
- **React** (19.2.0) - UI library
- **React DOM** (19.2.0) - React DOM renderer
- **TypeScript** (^5) - Type safety

#### UI Components / Styling
- **Tailwind CSS** (^4) - Utility-first CSS framework
- **@tailwindcss/postcss** (^4) - Tailwind CSS PostCSS plugin
- **tw-animate-css** (^1.4.0) - Tailwind CSS animations
- **Radix UI** - Accessible UI primitives
  - **@radix-ui/react-checkbox** (^1.3.3) - Checkbox
  - **@radix-ui/react-dialog** (^1.1.15) - Dialog
  - **@radix-ui/react-label** (^2.1.7) - Label
  - **@radix-ui/react-slot** (^1.2.3) - Slot
- **lucide-react** (^0.548.0) - Icon library
- **class-variance-authority** (^0.7.1) - Component variants
- **clsx** (^2.1.1) - Classname utility
- **tailwind-merge** (^3.3.1) - Tailwind class merge

#### Forms
- **react-hook-form** (^7.65.0) - Form state management
- **@hookform/resolvers** (^5.2.2) - Validation resolvers
- **zod** (^4.1.12) - Schema validation

#### Drag & Drop
- **@dnd-kit/core** (^6.3.1) - DnD core
- **@dnd-kit/sortable** (^10.0.0) - Sortable lists
- **@dnd-kit/utilities** (^3.2.2) - DnD utilities

#### Utilities
- **date-fns** (^4.1.0) - Date utilities

#### Dev Tools
- **ESLint** (^9) - Linting
- **eslint-config-next** (16.0.0) - Next.js ESLint config
- **@types/node** (^20) - Node.js type definitions
- **@types/react** (^19) - React type definitions
- **@types/react-dom** (^19) - React DOM type definitions

### Infrastructure
- **Docker & Docker Compose** - Containerization
- **Nginx** - Reverse proxy / load balancer
- **PostgreSQL** (17 with pgvector) - Database
- **Redis** - Cache / message broker

## Setup

### Prerequisites

This project is designed to run with **Docker Compose**.

**Required:**
- Docker Desktop or Docker Engine (20.10+)
- Docker Compose (2.0+, typically bundled with Docker Desktop)

**Recommended Environment:**
- macOS, Linux, or Windows (WSL2 recommended)
- At least 4GB RAM
- At least 10GB free disk space

### Setup with Docker Compose

All services (frontend, backend, database, Redis, Celery, Nginx) are managed by Docker Compose.

#### 1. Configure environment variables

Create a `.env` file in the project root and set the required variables.

```bash
# Copy .env.example to .env
cp .env.example .env

# Edit variables as needed
vim .env
```

Required variables:
- `POSTGRES_DB` - PostgreSQL database name
- `POSTGRES_USER` - PostgreSQL user
- `POSTGRES_PASSWORD` - PostgreSQL password
- `SECRET_KEY` - Django secret key
- `DATABASE_URL` - PostgreSQL connection URL (optional)
- `CELERY_BROKER_URL` - Redis connection URL (optional)
- `CELERY_RESULT_BACKEND` - Celery result backend URL (optional)
- `ENABLE_SIGNUP` - Enable/disable sign-up (default: "True")
- `ALLOWED_HOSTS` - Allowed hostnames (comma-separated)
- `CORS_ALLOWED_ORIGINS` - CORS allowed origins (comma-separated)
- `ANYMAIL_*` - Email sending config (for email verification and password reset)
- `FRONTEND_URL` - Frontend URL (used for links in emails)
- `USE_S3_STORAGE` - Use S3 storage if "true" (default: "false")
- `AWS_STORAGE_BUCKET_NAME` - S3 bucket name (required if `USE_S3_STORAGE=true`)
- `AWS_ACCESS_KEY_ID` - AWS access key ID (required if `USE_S3_STORAGE=true`)
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key (required if `USE_S3_STORAGE=true`)
- `NEXT_PUBLIC_API_URL` - API URL for Next.js
- Other variables required by the application (e.g., OpenAI API key)

#### 2. Start all services

```bash
# Build and start all services (redis, postgres, backend, celery-worker, frontend, nginx)
docker-compose up --build -d
```

This starts:
- **redis**: Redis (Celery broker)
- **postgres**: PostgreSQL database (17 with pgvector)
- **backend**: Django REST API (internal port 8000)
- **celery-worker**: Celery worker (background tasks)
- **frontend**: Next.js frontend (internal port 3000)
- **nginx**: Reverse proxy (port 80)

#### 3. First-time setup

```bash
# Run database migrations
docker-compose exec backend uv run python manage.py migrate

# Create admin user (first time only)
docker-compose exec backend uv run python manage.py createsuperuser
```

#### 4. Verify startup

After all services are up, you can access:

- **Frontend**: http://localhost
- **Backend API**: http://localhost/api
- **Admin**: http://localhost/admin

#### Other useful commands

```bash
# Check status of all containers
docker-compose ps

# Tail logs for all services
docker-compose logs -f

# Tail logs for specific services
docker-compose logs -f backend
docker-compose logs -f celery-worker
docker-compose logs -f frontend

# Stop containers
docker-compose stop

# Stop and remove containers (keep volumes)
docker-compose down

# Stop and remove containers (remove volumes too)
docker-compose down -v

# Restart a specific service
docker-compose restart backend

# Restart all services
docker-compose restart

# Connect to the database
docker-compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
```

## Feature Details

### Authentication

- User registration (with email verification)
- Email verification (post sign-up)
- Login (JWT)
- Token refresh
- Logout
- Password reset (via email)

### Video Management

- Upload videos (MP4, MOV, WEBM, etc.)
- Automatic transcription (Whisper API)
- Update and delete video information
- Get video list

#### Supported File Formats
- Audio: `.flac`, `.m4a`, `.mp3`, `.mpga`, `.oga`, `.ogg`, `.wav`, `.webm`
- Video: `.mp4`, `.mpeg`, `.webm`, `.mov` (auto-converted to MP3 via ffmpeg)

### Video Groups

- Create, edit, and delete groups
- Add multiple videos to a group
- Reorder videos within a group
- Share groups with share tokens

### AI Chat

- Ask questions about video content
- Conversational integration with the OpenAI API
- Answers grounded in transcription data

### Sharing

- Generate share tokens
- View videos via shared links
- Access shared videos without authentication

## API Endpoints

### Authentication

- `POST /api/auth/signup/` - Sign up (requires email verification)
- `POST /api/auth/verify-email/` - Email verification
- `POST /api/auth/login/` - Login
- `POST /api/auth/logout/` - Logout
- `POST /api/auth/refresh/` - Token refresh
- `GET /api/auth/me/` - Current user info
- `PATCH /api/auth/me/` - Update user info (save OpenAI API key)
- `POST /api/auth/password-reset/` - Request password reset
- `POST /api/auth/password-reset/confirm/` - Confirm password reset

### Video Management

- `GET /api/videos/` - List videos
- `POST /api/videos/` - Upload video
- `GET /api/videos/<id>/` - Get video detail
- `PATCH /api/videos/<id>/` - Update video
- `DELETE /api/videos/<id>/` - Delete video

### Video Groups

- `GET /api/videos/groups/` - List groups
- `POST /api/videos/groups/` - Create group
- `GET /api/videos/groups/<id>/` - Group detail
- `PATCH /api/videos/groups/<id>/` - Update group
- `DELETE /api/videos/groups/<id>/` - Delete group
- `POST /api/videos/groups/<id>/videos/` - Add videos to group
- `DELETE /api/videos/groups/<id>/videos/<video_id>/remove/` - Remove video from group
- `POST /api/videos/groups/<id>/reorder/` - Reorder videos in group
- `POST /api/videos/groups/<id>/share/` - Create share link
- `DELETE /api/videos/groups/<id>/share/delete/` - Delete share link
- `GET /api/videos/groups/shared/<token>/` - Get shared group info

### Chat

- `POST /api/chat/` - Send chat
- `GET /api/chat/history/` - Get chat history (requires `group_id` query param)
- `GET /api/chat/history/export/` - Export chat history (CSV)
- `POST /api/chat/feedback/` - Submit chat feedback

### Media Delivery

- `GET /media/<path>` - Serve protected media (requires JWT or share token)

## API Guide for External Clients

This section summarizes practical usage from external clients.

### Basics

- **Base URL**: `http://localhost` (default in Docker setup)
- **API path**: `/api`
- **Auth**: `Authorization: Bearer <access_token>` (use Bearer auth for external clients)
- **Token TTL**: Access 10 minutes, Refresh 14 days

Environment variable examples:
```bash
BASE_URL="http://localhost"
ACCESS="<JWT_ACCESS_TOKEN>"
TOKEN="<SHARE_TOKEN>"
```

### Quickstart

#### 1. Authentication (Sign-up / Login)

```bash
# Sign up (email verification required)
curl -X POST "$BASE_URL/api/auth/signup/" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"pass1234"}'

# Email verification (use token sent via email after sign-up)
curl -X POST "$BASE_URL/api/auth/verify-email/" \
  -H "Content-Type: application/json" \
  -d '{"uid":"<USER_ID>","token":"<VERIFICATION_TOKEN>"}'

# Login (get access/refresh)
curl -X POST "$BASE_URL/api/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass1234"}'
# Use the access token for subsequent Authorization headers

# Refresh access token
curl -X POST "$BASE_URL/api/auth/refresh/" \
  -H "Content-Type: application/json" \
  -d '{"refresh":"<JWT_REFRESH_TOKEN>"}'

# Get current user
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/auth/me/"

# Update user (save OpenAI key, stored encrypted)
curl -X PATCH "$BASE_URL/api/auth/me/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"encrypted_openai_api_key":"sk-xxxx"}'

# Request password reset
curl -X POST "$BASE_URL/api/auth/password-reset/" \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'

# Confirm password reset (use token sent via email)
curl -X POST "$BASE_URL/api/auth/password-reset/confirm/" \
  -H "Content-Type: application/json" \
  -d '{"uid":"<USER_ID>","token":"<RESET_TOKEN>","new_password":"newpass1234"}'

# Logout
curl -X POST "$BASE_URL/api/auth/logout/" \
  -H "Authorization: Bearer $ACCESS"
```

#### 2. Upload a video and check status

```bash
# Upload (multipart)
curl -X POST "$BASE_URL/api/videos/" \
  -H "Authorization: Bearer $ACCESS" \
  -F "file=@/path/to/movie.mp4" \
  -F "title=Demo Video" \
  -F "description=Description"

# List
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/"

# Detail (check transcript/status/error_message)
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/123/"

# Update
curl -X PATCH "$BASE_URL/api/videos/123/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"title":"New title"}'

# Delete
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/123/"
```

#### 3. Create a video group and add videos

```bash
# Create group
curl -X POST "$BASE_URL/api/videos/groups/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"name":"Project A","description":"Related videos"}'

# List groups
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/groups/"

# Group detail
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/groups/10/"

# Add a single video to group
curl -X POST -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/videos/123/"

# Add multiple videos to group
curl -X POST "$BASE_URL/api/videos/groups/10/videos/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"video_ids":[101,102,103]}'

# Remove a video from group
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/videos/123/remove/"

# Reorder videos within group
curl -X PATCH "$BASE_URL/api/videos/groups/10/reorder/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"video_ids":[103,101,102]}'

# Update group
curl -X PATCH "$BASE_URL/api/videos/groups/10/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"name":"New name"}'

# Delete group
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/"
```

#### 4. Chat (RAG-enabled)

```bash
# Use with JWT (Bearer)
curl -X POST "$BASE_URL/api/chat/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": 10,
    "messages": [
      {"role":"user","content":"Summarize the key points."}
    ]
  }'

# Get chat history
curl -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/chat/history/?group_id=10"

# Export chat history (CSV)
curl -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/chat/history/export/?group_id=10" \
  -o chat_history.csv

# Send chat feedback
curl -X POST "$BASE_URL/api/chat/feedback/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_log_id": 123,
    "feedback": "helpful"
  }'
```

Notes:
- If you pass `group_id`, vector search (RAG) is limited to videos in that group.
- Save your OpenAI API key via a `PATCH` request to `/api/auth/me/` (`encrypted_openai_api_key`).
- Chat is also available with a share token (use the `share_token` query parameter).
- Do not send a `system` message; the backend constructs the system prompt internally. Only the latest `user` message in `messages` is used.

#### 5. Share links

```bash
# Issue a share link (get share_token)
curl -X POST -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/share/"

# View shared group (no auth required)
curl "$BASE_URL/api/videos/groups/shared/$TOKEN/"

# Chat with share token (body requires group_id)
curl -X POST "$BASE_URL/api/chat/?share_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": 10,
    "messages": [
      {"role":"user","content":"What is the overview of these videos?"}
    ]
  }'

# Disable share link
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/share/delete/"
```

Notes:
- For videos uploaded via external API clients, the source files are deleted after processing. Protected media delivery is not available for those files; only transcripts and metadata can be retrieved.

### Error Responses

Common error responses:

- **400**: Validation error (e.g., `"video_ids must be an array"`)
- **401**: Authentication error (e.g., `"Invalid refresh token"`)
- **403**: Permission denied
- **404**: Resource not found (e.g., `"Share link not found"`, `"Group not found"`)

### Authentication Modes

**For external clients, always use the `Authorization` header (Bearer). Do not use cookie-based auth, as it can cause uploaded files to remain stored.**

- **External clients**: Use the `Authorization` header (Bearer) only
- **Internal browser app**: HttpOnly cookies (easy automatic refresh)

## Docker Compose Architecture

This project consists of the following services:

- **redis**: Redis (Celery broker and result backend)
- **postgres**: PostgreSQL database (17 with pgvector)
- **backend**: Django REST API (internal port 8000)
- **celery-worker**: Celery worker (background tasks)
- **frontend**: Next.js frontend (internal port 3000)
- **nginx**: Reverse proxy (port 80)

### Volume Mounts

- `postgres_data`: Persist PostgreSQL data
- `staticfiles`: Django static files
- `./backend/media`: Uploaded media files

### Network

All services communicate within the `ask-video-network` Docker network.

## Database Schema

### Main Models

- **User**: User info (extends Django AbstractUser; includes encrypted OpenAI API key and email verification state)
- **Video**: Video info (title, description, file, transcript, status, external upload flag, restrictions, etc.)
- **VideoGroup**: Video groups (name, description, share token, etc.)
- **VideoGroupMember**: Association between videos and groups (ordering support)
- **ChatLog**: Chat logs (question, answer, related videos, shared-from flag, etc.)

## Development

### Backend (Docker environment)

This project uses `uv` for Python package management.

```bash
# Run tests
docker-compose exec backend uv run python manage.py test

# Create migrations
docker-compose exec backend uv run python manage.py makemigrations

# Apply migrations
docker-compose exec backend uv run python manage.py migrate

# Open Django shell
docker-compose exec backend uv run python manage.py shell

# Tail logs (live)
docker-compose logs -f backend celery-worker
```

**Note:** In Docker, run all Python commands via `uv run`.

### Frontend (Docker environment)

```bash
# Build the frontend
docker-compose exec frontend npm run build

# Tail frontend logs
docker-compose logs -f frontend
```

## Production Deployment

Pay attention to the following in production:

1. **Environment variables**: Set appropriate values in `.env`
2. **Security**: Keep `SECRET_KEY` safe
3. **Database**: Configure PostgreSQL properly
4. **Media files**: Configure storage appropriately
5. **CORS**: Set allowed origins
6. **SSL/TLS**: Configure HTTPS

## Troubleshooting

### All services fail to start

1. Check Docker Compose status
```bash
docker-compose ps
```

2. Inspect logs for errors
```bash
docker-compose logs
```

3. Rebuild containers
```bash
docker-compose down
docker-compose up --build -d
```

### Celery tasks do not run

1. Check the Celery worker container is running
```bash
docker-compose ps celery-worker
```

2. Check Celery worker logs
```bash
docker-compose logs celery-worker
```

3. Verify Redis is running
```bash
docker-compose ps redis
# Or
docker-compose exec redis redis-cli ping  # Expect PONG
```

4. Check registered Celery tasks
```bash
docker-compose exec backend uv run python -c "from app.celery_config import app; print(app.tasks.keys())"
```

### Transcription fails

1. Ensure the user's OpenAI API key is set
2. Verify the API key is valid
3. Ensure the video file exists
```bash
docker-compose exec backend uv run python manage.py shell
>>> from app.models import Video
>>> video = Video.objects.first()
>>> print(video.error_message)  # Inspect error message
```

### Database connection errors

1. Ensure the PostgreSQL container is running
```bash
docker-compose ps postgres
```

2. Check DB connection
```bash
docker-compose exec backend uv run python manage.py dbshell
```

### Frontend does not render

1. Ensure the frontend container is running
```bash
docker-compose ps frontend
```

2. Check frontend logs
```bash
docker-compose logs frontend
```

3. Ensure Nginx is healthy
```bash
docker-compose logs nginx
```

4. Review Nginx config (`nginx.conf`)

### When a rebuild is needed

```bash
# Stop all containers
docker-compose down

# Rebuild images and start
docker-compose up --build -d

# Re-apply migrations
docker-compose exec backend uv run python manage.py migrate
```

### Volume issues

To completely reset data:

```bash
# Warning: this removes all data
docker-compose down -v
docker-compose up --build -d
docker-compose exec backend uv run python manage.py migrate
docker-compose exec backend uv run python manage.py createsuperuser
```