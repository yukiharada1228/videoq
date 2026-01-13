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
- **Tag management**: organize videos with custom tags (name + color)
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
│   └── requirements.txt # Python dependencies
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
  - Embedding and LLM providers are configurable (OpenAI or Ollama)
  - Model selection via `EMBEDDING_MODEL` and `LLM_MODEL` environment variables
- **Ollama** (optional): Local LLM and embedding models without API keys
- **scikit-learn**: ML utilities
- **numpy**: Numerical computing

#### Storage & Security
- **django-storages** + **boto3**: S3-compatible storage (optional)
- **django-cors-headers**: CORS policy management

#### Email & Communication
- **django-anymail**: Email service integration (verification, password reset)

#### Development Tools
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

### LLM and Embedding Configuration
- LLM and embedding providers are configured globally via environment variables
- Supports both OpenAI API and local Ollama models
- When using OpenAI, the global `OPENAI_API_KEY` environment variable is used
- When using Ollama, no API key is required

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
- `EMBEDDING_PROVIDER` (openai or ollama; default: `openai`)
- `EMBEDDING_MODEL` (embedding model for selected provider; default: `text-embedding-3-small`)
- `LLM_PROVIDER` (openai or ollama; default: `openai`)
- `LLM_MODEL` (LLM model for selected provider; default: `gpt-4o-mini`)

### 2) Start

```bash
docker compose up --build -d
```

### 3) First-time setup

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py collectstatic
docker compose exec backend python manage.py createsuperuser
```

### 4) Access URLs

- **Frontend**: `http://localhost`
- **Backend API**: `http://localhost/api`
- **Admin**: `http://localhost/api/admin`
- **Swagger**: `http://localhost/api/docs/`
- **ReDoc**: `http://localhost/api/redoc/`

## Local Whisper Transcription (Optional)

Use a local whisper.cpp server for faster, cost-free GPU-accelerated transcription.

### Quick Setup

```bash
# 1. Initialize submodule (from VideoQ root)
git submodule update --init --recursive
cd whisper.cpp

# 2. Build whisper.cpp
cmake -B build
cmake --build build -j --config Release

# 3. Download model
bash ./models/download-ggml-model.sh large-v3-turbo

# 4. Start server (macOS/Linux)
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin --inference-path /audio/transcriptions

# 4. Start server (Windows - use Git Bash or adjust paths for PowerShell)
./build/bin/Release/whisper-server.exe -m models/ggml-large-v3-turbo.bin --inference-path /audio/transcriptions
```

### Configure VideoQ

Update `.env` in VideoQ root:
```bash
WHISPER_BACKEND=local
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

Restart services:
```bash
docker compose restart backend celery-worker
```

### GPU Acceleration (Optional)

**macOS:** GPU acceleration via Metal is enabled by default (no additional setup needed).

**Windows/Linux:** For better performance, rebuild with GPU support:

```bash
# NVIDIA GPU
cmake -B build -DGGML_CUDA=1
cmake --build build -j --config Release

# Other GPU (Vulkan)
cmake -B build -DGGML_VULKAN=1
cmake --build build -j --config Release
```

**Requirements:**
- macOS: Xcode Command Line Tools (`xcode-select --install`) - Metal enabled automatically
- Windows: CMake + Visual Studio Build Tools
- CUDA: NVIDIA GPU + CUDA Toolkit
- Vulkan: GPU with Vulkan drivers

## Local Embedding Models with Ollama (Optional)

VideoQ supports local embedding generation using Ollama, eliminating the need for OpenAI API keys for embeddings.

### About qwen3-embedding:0.6b

VideoQ uses the [qwen3-embedding:0.6b](https://ollama.com/library/qwen3-embedding:0.6b) model for local embeddings:

- **Size**: 0.6 billion parameters (639MB)
- **Languages**: 100+ languages supported
- **Use cases**: Text retrieval, code retrieval, text classification, clustering
- **Benefits**: No API costs, privacy-focused, works offline

### Quick Setup

**1. Install Ollama**

Download and install from [ollama.com](https://ollama.com) (macOS, Linux, or Windows).

**2. Pull the embedding model**

```bash
ollama pull qwen3-embedding:0.6b
```

**3. Verify Ollama is running**

```bash
curl http://localhost:11434/api/tags
```

**4. Configure VideoQ**

Update `.env`:

```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

**5. Restart services**

```bash
docker compose restart backend celery-worker
```

### What Uses Local Embeddings?

When `EMBEDDING_PROVIDER=ollama`:

1. **Vector Indexing**: Video transcripts embedded and stored in pgvector
2. **Scene Splitting**: Otsu method uses embeddings for semantic scene detection
3. **RAG Chat**: User queries embedded for similarity search

All embedding operations run locally without OpenAI API calls.

### Switching Providers

Change `EMBEDDING_PROVIDER` and `EMBEDDING_MODEL` in `.env`:

```bash
# OpenAI (requires API key)
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small

# Ollama (local, no API key)
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

**Important**: Different embedding models produce incompatible vectors. After switching providers, you must re-index existing videos for consistent search results (see [Re-indexing Video Embeddings](#re-indexing-video-embeddings)).

### Local LLM with Ollama (Optional)

VideoQ also supports local LLM models using Ollama for chat functionality:

**1. Pull an LLM model**

```bash
ollama pull qwen3:0.6b
# or other models: llama3:8b, mistral:7b, etc.
```

**2. Configure VideoQ**

Update `.env`:

```bash
LLM_PROVIDER=ollama
LLM_MODEL=qwen3:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

**3. Restart services**

```bash
docker compose restart backend celery-worker
```

## Re-indexing Video Embeddings

When switching embedding providers or models, existing video embeddings become incompatible with the new model. VideoQ provides an admin feature to re-index all videos with the new embedding model.

### When to Re-index

Re-indexing is required when:

- **Switching embedding providers**: OpenAI ↔ Ollama
- **Changing embedding models**: e.g., `text-embedding-3-small` → `text-embedding-3-large`
- **After model configuration changes**: Any change to `EMBEDDING_PROVIDER` or `EMBEDDING_MODEL`

### How to Re-index

1. **Update environment variables** in `.env`:
   ```bash
   EMBEDDING_PROVIDER=ollama
   EMBEDDING_MODEL=qwen3-embedding:0.6b
   ```

2. **Restart services**:
   ```bash
   docker compose restart backend celery-worker
   ```

3. **Access Django Admin**:
   - Navigate to `http://localhost/api/admin`
   - Login with superuser credentials

4. **Run re-indexing**:
   - Click on **Videos** in the admin panel
   - Select any video (selection is ignored - all videos will be re-indexed)
   - Choose **"Re-index video embeddings"** from the Actions dropdown
   - Click **"Go"**

5. **Monitor progress**:
   ```bash
   docker compose logs -f celery-worker
   ```

### What Happens During Re-indexing

1. **Delete old vectors**: All existing embeddings are removed from pgvector
2. **Re-generate embeddings**: Each video's transcript is processed with the new model
3. **Error handling**: Failed videos are logged; re-indexing continues for other videos
4. **No re-transcription**: Uses existing transcripts (Whisper is not re-run)

### Important Notes

- **Superuser only**: Re-indexing is restricted to superusers
- **Background processing**: Runs asynchronously via Celery (non-blocking)
- **Search downtime**: Search may return incomplete results during re-indexing
- **Uses environment variables**: Global `OPENAI_API_KEY` is used (not per-user API keys)
- **Time estimate**: Depends on number of videos and embedding provider speed

### Example Log Output

```
[2026-01-12 17:57:02] Starting re-indexing: 10 videos
[2026-01-12 17:57:02] Deleted 150 vectors
[2026-01-12 17:57:05] [1/10] Successfully re-indexed video 45
[2026-01-12 17:57:08] [2/10] Successfully re-indexed video 46
...
[2026-01-12 17:58:30] Re-indexing completed: Re-indexed 10/10 videos
```

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
pip install -r requirements.txt
python manage.py runserver
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
python manage.py test
coverage run --source='.' manage.py test
coverage report
```

### Code Quality

**Frontend:**
```bash
npm run lint              # ESLint
```

**Backend:**
```bash
black .            # Format code
isort .            # Sort imports
```

### Common Docker Commands

```bash
docker compose ps                                          # List services
docker compose logs -f                                     # Follow all logs
docker compose logs -f backend celery-worker               # Follow specific services
docker compose exec backend python manage.py shell         # Django shell
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
