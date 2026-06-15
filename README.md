# VideoQ

**Jump instantly to the scenes you want by asking AI questions**

VideoQ is an AI-powered video navigator that automatically transcribes videos and lets you chat with them in natural language.

**[https://videoq.jp/](https://videoq.jp/)**

Japanese version: [README.ja.md](README.ja.md)

![VideoQ Application Screenshot](assets/screenshot.gif)

> **API integration supported** - Connect VideoQ with existing systems through API key authentication and an OpenAI-compatible API. See [Developer API Integration](#developer-api) for details.
>
> **Design documentation** - See [docs/](docs/README.md) for architecture diagrams, ER diagrams, sequence diagrams, and other technical details.

## Features

- **Upload supported video formats** - MP4, MOV, AVI, MKV, WebM, M4V, MPEG, 3GP, and more
- **Ask questions** - For example, "What did they say about the budget?" or "Summarize the key points"
- **Search video content** - Find specific moments without scrubbing through hours of footage
- **Organize with tags** - Manage videos with custom tags and colors
- **Share insights** - Create shareable video groups for team collaboration
- **Multilingual UI** - Switch between Japanese and English interfaces

## Quick Start (5 minutes)

### Requirements

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed
- An [OpenAI API key](https://platform.openai.com/api-keys) for the default configuration
- A [SearchAPI API key](https://www.searchapi.io/) if you want to import YouTube videos

This guide walks you through starting VideoQ locally and opening it in your browser.

### Step 1: Get an OpenAI API key for the default setup

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key, which starts with `sk-...`

The default setup uses OpenAI for transcription, embeddings, and chat. If you want a fully local setup, switch to the local Whisper / Ollama configuration described below.

### Step 2: Set up VideoQ

```bash
# Clone the project and enter the directory
git clone https://github.com/yukiharada1228/videoq.git
cd videoq

# Copy the environment file
cp .env.example .env
```

Open `.env` and set the OpenAI API key used by the default configuration.

```bash
OPENAI_API_KEY=sk-proj-...
```

If you want to fetch subtitles from YouTube URLs, each user should configure their own `SearchAPI` key from the VideoQ Settings screen.

### Step 3: Start VideoQ

```bash
# Start all services. The first run may take a few minutes.
docker compose up --build -d

# Initial setup
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py collectstatic --noinput
docker compose exec backend python manage.py createsuperuser
```

### Step 4: Start using VideoQ

Open [http://localhost](http://localhost) in your browser.

**Useful links:**
- **Admin panel:** [http://localhost/api/admin](http://localhost/api/admin) for managing users and videos
- **API docs:** [http://localhost/api/docs/](http://localhost/api/docs/) for developers

**First steps:**
1. Log in with the admin account you created
2. Create regular users if needed
3. Configure upload limits for regular users
4. Upload a video, wait for transcription, and try chatting with it

### Check first: user limit settings

VideoQ manages per-user limits directly from the admin panel.

**Where to configure them**
1. Open the [admin panel](http://localhost/api/admin)
2. Open `Users`
3. Select the target user
4. Configure the following values and save

| Setting | Description |
|----------|-------------|
| `Max video upload size mb` | Maximum upload size per video in MB. Default: 500 |
| `Storage limit gb` | Storage limit in GB. Default: 0, or leave blank for unlimited |
| `Processing limit minutes` | Monthly transcription processing limit in minutes. Default: 0, or leave blank for unlimited |
| `Ai answers limit` | Monthly AI answer limit. Default: 0, or leave blank for unlimited |

<details>
<summary><strong>Optional: cloud storage setup (AWS S3 / Cloudflare R2)</strong></summary>

**This step is optional.** VideoQ stores videos on the local filesystem by default, but you can also use object storage such as AWS S3 or Cloudflare R2.

Configure the following values in `.env`:

```bash
USE_S3_STORAGE=true
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_STORAGE_BUCKET_NAME=your-bucket

# AWS S3
AWS_S3_REGION_NAME=ap-northeast-1

# Cloudflare R2
AWS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
AWS_S3_REGION_NAME=auto
```

Restart the services:

```bash
docker compose restart backend celery-worker
```

</details>

<details>
<summary><strong>Optional: reduce costs with local AI</strong></summary>

**This step is optional.** Skip it if the default OpenAI setup works for you.

If you want to reduce costs or run fully offline for privacy reasons, you can switch to free local AI models with the following steps.

<details>
<summary><strong>Local Whisper for free transcription</strong></summary>

Use your computer's GPU for faster, free transcription.

**Quick setup:**

```bash
# 1. Fetch whisper.cpp from the VideoQ root directory
git submodule update --init --recursive
cd whisper.cpp

# 2. Build
cmake -B build
cmake --build build -j --config Release

# 3. Download a model
bash ./models/download-ggml-model.sh large-v3-turbo

# 4. Start the server
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin --inference-path /audio/transcriptions -l ja
```

**Configure VideoQ:**

Edit `.env`:

```bash
WHISPER_BACKEND=whisper.cpp
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

Restart the services:

```bash
docker compose restart backend celery-worker
```

</details>

<details>
<summary><strong>Local AI chat with Ollama as a free ChatGPT alternative</strong></summary>

**Install Ollama:**
1. Download it from [ollama.com](https://ollama.com)
2. Install and run it

**Pull a model:**

```bash
ollama pull qwen3:0.6b
```

**Configure VideoQ:**

Edit `.env`:

```bash
LLM_PROVIDER=ollama
LLM_MODEL=qwen3:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Restart the services:

```bash
docker compose restart backend celery-worker
```

</details>

<details>
<summary><strong>Local embeddings for free text search</strong></summary>

**Pull an embedding model:**

```bash
ollama pull qwen3-embedding:0.6b
```

**Configure VideoQ:**

Edit `.env`:

```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Restart the services:

```bash
docker compose restart backend celery-worker
```

**Important:** If you switch from OpenAI embeddings to local embeddings, you must re-index existing videos from the admin panel.

</details>

</details>

<a id="developer-api"></a>

## Developer API Integration

VideoQ supports API key authentication for integrations, so you can use it from existing systems and batch jobs through server-to-server communication.

Issue a `vq_...` integration key from "Integration API Keys" in the Settings screen. Use the `X-API-Key` header for the REST API and `Authorization: Bearer <vq_...>` for the OpenAI-compatible API. For integration steps, authentication details, and endpoint-specific sample code in cURL / JavaScript / TypeScript / Python / Go / Java / C# / PHP / Ruby, see the in-app developer docs.

- **Developer docs:** [http://localhost/docs](http://localhost/docs)
- **OpenAPI (Swagger UI):** [http://localhost/api/docs/](http://localhost/api/docs/)
- **ReDoc:** [http://localhost/api/redoc/](http://localhost/api/redoc/)

## Contributing

Found a bug or want to add a feature? Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests as needed
5. Submit a pull request

## Citation

- Hirotsugu Fujiyoshi. "Using Generative AI in Education in an Era of Living with AI: 'Professor Fujiyoshi AI'". IPSJ Magazine "Information Processing" Vol.66, No.11 (2025).
  - [https://ipsj.ixsq.nii.ac.jp/records/2004788](https://ipsj.ixsq.nii.ac.jp/records/2004788)

## License

See the [LICENSE](LICENSE) file for details.
