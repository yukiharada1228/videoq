# VideoQ

VideoQ is a web application that provides video transcription (Whisper) and AI chat (RAG) over those transcripts.

## Overview

When a user uploads a video, transcription runs automatically in the background. Once completed, the user can ask questions grounded in the video (and its scenes) using Retrieval-Augmented Generation (RAG) powered by vector similarity search.

## Key Features

- **Authentication**: JWT via HttpOnly cookies (email verification + password reset)
- **Video upload**: supports multiple formats
- **Upload limit**: per-user limit via `User.video_limit` (`NULL` = unlimited, `0` = disabled)
- **Automatic transcription**: async processing via Celery (Whisper API)
- **AI chat**: RAG using pgvector (OpenAI API)
- **Group management**: group multiple videos and reorder them with drag-and-drop
- **Sharing**: share groups via share token (guest viewing/chat)
- **Protected media delivery**: served only with auth/share token
- **Internationalization**: Multi-language support with i18next

## Architecture

### System Overview (Docker Compose)

The default local setup (see `docker-compose.yml`) is:

```text
nginx (port 80)
  ├─ /api      → backend (Django REST API)
  ├─ /media    → protected media files
  └─ /         → frontend (React SPA)
```

**Services:**

- **nginx**: reverse proxy and entry point (port `80`)
- **frontend**: Vite-built React SPA (container port `80`)
- **backend**: Django REST API (container port `8000`)
- **celery-worker**: async task processor (transcription, vector indexing)
- **postgres**: PostgreSQL 17 with pgvector extension
- **redis**: Celery broker and result backend

### Data Flow

1. **Video Upload**: User uploads video → Django saves to storage (local/S3)
2. **Transcription**: Celery task → Whisper API → save transcript to PostgreSQL
3. **Vectorization**: Transcript chunked → OpenAI Embeddings → stored in pgvector
4. **Chat**: User question → embedded → similarity search → context + query → OpenAI Chat API → response

### Directory Structure

```text
videoq/
├── backend/             # Django / DRF / Celery
│   ├── app/             # Main Django app
│   ├── videoq/          # Project settings
│   ├── media/           # Uploaded videos (local storage)
│   └── pyproject.toml   # Python dependencies (uv)
├── frontend/            # Vite + React + TypeScript
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Route pages
│   │   ├── hooks/       # Custom React hooks
│   │   ├── lib/         # Utilities
│   │   └── i18n/        # Internationalization
│   └── package.json     # Node dependencies
├── docs/                # Design docs (Mermaid diagrams)
├── docker-compose.yml
└── nginx.conf
```

## Tech Stack

### Backend

#### Framework & API
- **Django 5.2+**: Web framework
- **Django REST Framework**: RESTful API
- **djangorestframework-simplejwt**: JWT authentication
- **drf-spectacular**: OpenAPI/Swagger schema generation
- **gunicorn** + **uvicorn-worker**: ASGI production server

#### Async Task Processing
- **Celery 5.5+**: Distributed task queue
- **Redis**: Message broker and result backend

#### Database & Vector Search
- **PostgreSQL 17**: Primary database
- **pgvector**: Vector similarity search extension
- **psycopg2-binary**: PostgreSQL adapter
- **LangChain** + **langchain-postgres**: RAG pipeline orchestration
- **langchain-openai**: OpenAI integration for LangChain

#### AI/ML
- **OpenAI API**: Whisper (transcription), Chat (dialogue), Embeddings (vectorization)
  - Chat model and temperature are user-configurable (see Per-User LLM Settings)
  - Embedding model is configurable via `EMBEDDING_MODEL` environment variable
- **scikit-learn**: ML utilities
- **numpy**: Numerical computing

#### Storage & Security
- **django-storages** + **boto3**: S3-compatible storage (optional)
- **cryptography**: Encrypt user API keys in database
- **django-cors-headers**: CORS policy management

#### Email & Communication
- **django-anymail**: Email service integration (verification, password reset)

#### Development Tools
- **uv**: Fast Python package manager
- **black**: Code formatter
- **isort**: Import statement organizer
- **dj-database-url**: Database URL parser

### Frontend

#### Core Framework
- **React 19.2**: UI library (latest version)
- **TypeScript 5.9**: Type safety
- **Vite 7.2**: Fast build tool with HMR
- **@vitejs/plugin-react-swc**: SWC-based fast compiler

#### Routing & State
- **React Router 7.1**: SPA routing with `/:locale/...` support
- **react-hook-form 7.65**: High-performance form management
- **@hookform/resolvers**: Validation integration
- **zod 4.1**: Schema validation

#### UI/UX
- **Tailwind CSS 4.1**: Utility-first CSS framework
- **@tailwindcss/postcss**: PostCSS integration
- **Radix UI**: Accessible, unstyled UI primitives (Dialog, Checkbox, Label, Slot)
- **lucide-react**: Icon library
- **class-variance-authority**: Variant-based styling
- **clsx** + **tailwind-merge**: Class name utilities

#### Drag & Drop
- **@dnd-kit/core** + **@dnd-kit/sortable** + **@dnd-kit/utilities**: Drag-and-drop for video group reordering

#### Internationalization
- **i18next** + **react-i18next**: Multi-language support

#### Utilities
- **date-fns**: Date manipulation

#### Testing & Development
- **Vitest 3.2**: Fast unit testing framework
- **@testing-library/react**: React component testing
- **@testing-library/user-event**: User interaction simulation
- **@vitest/coverage-v8**: Code coverage reports
- **jsdom**: DOM mocking
- **ESLint 9**: Linting with react-hooks and react-refresh plugins

## Security

### Authentication & Authorization
- **JWT tokens** stored in HttpOnly cookies (XSS protection)
- Email verification required for signup
- Password reset flow via email

### API Key Management
- User API keys encrypted at rest using `cryptography` library
- Per-user API key storage (not shared)
- Shared group chats use the group owner's API key

### Media Protection
- All media files require authentication or valid share token
- nginx validates auth before serving files

### CORS Policy
- Configurable allowed origins
- Development defaults: `localhost:3000`, `127.0.0.1:3000`

## Running (Docker Compose)

### 1) Environment variables

Copy `/.env.example` to create `/.env`.

```bash
cp .env.example .env
```

Important variables (minimum):

- `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `ENABLE_SIGNUP` (set to `True` or `False`)
- `FRONTEND_URL` (used in email links; default is `http://localhost`)
- `VITE_API_URL` (**used at frontend build time**; with the default Nginx setup, `/api` is recommended)
- `EMBEDDING_MODEL` (OpenAI embedding model for vector search; default: `text-embedding-3-small`)

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

### 4) Access URLs

- **Frontend**: `http://localhost`
- **Backend API**: `http://localhost/api`
- **Admin**: `http://localhost/api/admin`
- **Swagger**: `http://localhost/api/docs/`
- **ReDoc**: `http://localhost/api/redoc/`

## Important Note (OpenAI API Key)

This app assumes **OpenAI API keys are configured per user**.

- **Normal usage**: each user registers their API key in Settings (saved encrypted in DB)
- **Chat via shared link**: uses the **group owner's API key**

## Local Whisper Transcription (Optional)

VideoQ supports using a local whisper.cpp server for GPU-accelerated transcription on Mac (with Metal support), providing faster and cost-free transcription.

### Setup Steps

#### 1. Initialize Submodule (if not already done)

If you're setting up the project for the first time, initialize the whisper.cpp submodule:

```bash
# From VideoQ project root
git submodule update --init --recursive
```

#### 2. Build whisper.cpp with Metal Support

```bash
# Navigate to whisper.cpp directory
cd whisper.cpp

# Build with Metal GPU acceleration (Mac only)
make
```

**Requirements:**
- macOS with Apple Silicon (M1/M2/M3) or Intel Mac with Metal support
- Xcode Command Line Tools installed

#### 3. Download Whisper Model

Download the `large-v3-turbo` model

```bash
# From whisper.cpp directory
bash ./models/download-ggml-model.sh large-v3-turbo
```

#### 4. Start Whisper Server

Start the whisper.cpp server with OpenAI-compatible endpoint:

```bash
# From whisper.cpp directory
cd whisper.cpp
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin --inference-path /audio/transcriptions
```

#### 5. Configure VideoQ

Update your `.env` file in the VideoQ root directory:

```bash
WHISPER_BACKEND=local
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

#### 6. Restart VideoQ Services

Restart the backend and celery worker to apply the new configuration:

```bash
# From VideoQ project root
docker compose restart backend celery-worker
```

#### 7. Test Transcription

1. Upload a video through the VideoQ web interface
2. Check the celery-worker logs to confirm it's using the local whisper server:

```bash
docker compose logs -f celery-worker
```

You should see logs like:
```
Using Whisper backend: local, model: whisper-local
```

### Per-User LLM Settings

Users can customize their AI chat experience through the Settings page:

- **Preferred LLM Model**: Choose from GPT models (e.g., gpt-4o-mini, gpt-4o, gpt-4-turbo)
  - Default: `gpt-4o-mini`
  - Stored in `User.preferred_llm_model`
- **LLM Temperature**: Control response randomness (0.0 to 2.0)
  - Default: `0.0`
  - Stored in `User.preferred_llm_temperature`
  - Lower values (e.g., 0.0) produce more focused responses
  - Higher values (e.g., 1.5) produce more creative responses

These settings apply to all chat sessions for that user, including RAG-based chat on video groups.

Related: `docs/architecture/prompt-engineering.md`

## Development

### Frontend-only Development

For faster frontend development without Docker:

1. Ensure backend is running (via Docker Compose or locally)
2. Run frontend dev server:

```bash
cd frontend
npm install
npm run dev
```

The dev server runs at `http://localhost:3000` and proxies `/api` requests to `VITE_API_URL` (default: `http://localhost:8000`).

Configuration: `frontend/vite.config.ts`

### Backend Development

```bash
cd backend
uv sync
uv run python manage.py runserver
```

### Running Tests

**Frontend:**
```bash
cd frontend
npm run test              # Run tests once
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run typecheck         # TypeScript check
```

**Backend:**
```bash
cd backend
uv run python manage.py test
uv run coverage run --source='.' manage.py test
uv run coverage report
```

### Code Quality

**Frontend:**
```bash
npm run lint              # ESLint
```

**Backend:**
```bash
uv run black .            # Format code
uv run isort .            # Sort imports
```

### Common Docker Commands

```bash
docker compose ps                                          # List services
docker compose logs -f                                     # Follow all logs
docker compose logs -f backend celery-worker               # Follow specific services
docker compose exec backend uv run python manage.py shell  # Django shell
docker compose down                                        # Stop services
docker compose down -v                                     # Stop and delete volumes (CAUTION: deletes data)
```

## Scalability

- **Celery workers**: Horizontally scalable for parallel transcription tasks
- **S3 storage**: Offload media storage from application servers
- **pgvector**: Efficient vector similarity search with indexing
- **Redis**: In-memory caching and task queue
- **Stateless backend**: Easy to scale behind a load balancer

## License

See [LICENSE](LICENSE) file for details.
