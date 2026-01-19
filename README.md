# VideoQ

VideoQ is a web application that provides video transcription (Whisper) and AI chat (RAG) over those transcripts.

## Quick Start

Get VideoQ up and running in minutes using Docker.

### Prerequisites

-   [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

(Optional) Edit `.env` to configure settings. The default configuration is ready for local development.

### 2. Start Services

Start the application in the background:

```bash
docker compose up --build -d
```

### 3. Initial Setup

Run the following commands to set up the database and create an admin user:

```bash
# Apply database migrations
docker compose exec backend python manage.py migrate

# Collect static files (for admin panel)
docker compose exec backend python manage.py collectstatic --noinput

# Create a superuser (for admin panel access)
docker compose exec backend python manage.py createsuperuser
```

### 4. Access the Application

-   **Frontend:** [http://localhost](http://localhost)
-   **Backend API:** [http://localhost/api](http://localhost/api)
-   **Admin Panel:** [http://localhost/api/admin](http://localhost/api/admin)
-   **API Documentation:** [Swagger](http://localhost/api/docs/) | [ReDoc](http://localhost/api/redoc/)

## Features

-   **Authentication**: JWT via HttpOnly cookies (email verification + password reset)
-   **Video upload**: Supports multiple formats
-   **Upload limit**: Per-user limit via `User.video_limit` (`NULL` = unlimited, `0` = disabled)
-   **Automatic transcription**: Async processing via Celery (Whisper API)
-   **AI chat**: RAG using pgvector (OpenAI API)
-   **Tag management**: Organize videos with custom tags (name + color)
-   **Group management**: Group multiple videos and reorder them with drag-and-drop
-   **Sharing**: Share groups via share token (guest viewing/chat)
-   **Protected media delivery**: Served only with auth/share token
-   **Internationalization**: Multi-language support with i18next

## Advanced Configuration

### Local Whisper Transcription (Optional)

Use a local whisper.cpp server for faster, cost-free GPU-accelerated transcription.

**1. Quick Setup**

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
# Windows users: ./build/bin/Release/whisper-server.exe ...
```

**2. Configure VideoQ**

Update `.env` in VideoQ root:

```bash
WHISPER_BACKEND=whisper.cpp
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

Restart services:

```bash
docker compose restart backend celery-worker
```

**GPU Acceleration:**
-   **macOS**: Enabled by default via Metal.
-   **Windows/Linux**: Rebuild with `cmake -B build -DGGML_CUDA=1` (NVIDIA) or `-DGGML_VULKAN=1` (Other).

### Local Embedding Models with Ollama (Optional)

VideoQ supports local embedding generation using Ollama, eliminating the need for OpenAI API keys for embeddings.

**1. Install Ollama & Pull Model**

Download from [ollama.com](https://ollama.com).

```bash
ollama pull qwen3-embedding:0.6b
```

**2. Configure VideoQ**

Update `.env`:

```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

**3. Restart services**

```bash
docker compose restart backend celery-worker
```

**Note:** If switching providers (e.g., OpenAI → Ollama), you must re-index existing videos.

### Local LLM with Ollama (Optional)

**1. Pull LLM Model**

```bash
ollama pull qwen3:0.6b
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

### Re-indexing Video Embeddings

When switching embedding providers or models, you must re-index existing videos.

1.  Update `.env` with new embedding settings and restart services.
2.  Go to Django Admin: `http://localhost/api/admin`.
3.  Select **Videos**.
4.  Select any/all videos and choose **"Re-index video embeddings"** from the Actions dropdown.
5.  Click **"Go"**. This runs in the background via Celery.

## Development

### Frontend-only Development

For faster frontend iteration without Docker:

1.  Ensure backend is running (Docker or local).
2.  Run frontend dev server:

```bash
cd frontend
npm install
npm run dev
```

Server runs at `http://localhost:3000`.

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
npm run test              # Run tests
npm run test:watch        # Watch mode
```

**Backend:**
```bash
cd backend
python manage.py test
```

### Code Quality

-   **Frontend:** `npm run lint`
-   **Backend:** `black .` and `isort .`

### Common Docker Commands

```bash
docker compose ps                                          # List services
docker compose logs -f                                     # Follow all logs
docker compose logs -f backend celery-worker               # Follow specific services
docker compose exec backend python manage.py shell         # Django shell
docker compose down                                        # Stop services
```

## System Architecture

### Overview

-   **Frontend**: React (Vite) SPA
-   **Backend**: Django REST Framework
-   **Database**: PostgreSQL + pgvector
-   **Async Tasks**: Celery + Redis
-   **Proxy**: Nginx

The default local setup (see `docker-compose.yml`) exposes Nginx on port 80, which routes requests to frontend and backend.

### Data Flow

1.  **Video Upload**: User uploads video → Django saves to storage.
2.  **Transcription**: Celery task → Whisper API (or local) → save transcript to DB.
3.  **Vectorization**: Transcript chunked → Embeddings → stored in pgvector.
4.  **Chat**: User question → embedded → vector search → LLM answer.

### Tech Stack

#### Backend
-   **Django 5.2+**, **Django REST Framework**
-   **Celery 5.5+**, **Redis**
-   **PostgreSQL 17**, **pgvector**
-   **LangChain**, **OpenAI API**, **Ollama**

#### Frontend
-   **React 19.2**, **TypeScript 5.9**, **Vite 7.2**
-   **Tailwind CSS 4.1**, **Radix UI**, **Lucide React**
-   **React Router 7.1**, **React Hook Form**, **Zod**
-   **i18next**

### Security

-   **Authentication**: JWT in HttpOnly cookies.
-   **Media Protection**: Served via Nginx with auth validation.
-   **CORS**: Configurable allowed origins.

### Scalability

-   **Celery**: Horizontal scaling for transcription/indexing.
-   **Storage**: S3-compatible support (django-storages).
-   **Database**: pgvector for efficient vector search.

## License

See [LICENSE](LICENSE) file for details.
