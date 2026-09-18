# VideoQ

**Jump instantly to the scenes you want by asking AI questions**

VideoQ is a video learning platform that turns uploaded videos and YouTube lectures into searchable transcripts, timestamped Q&A, and guided study sessions. Organize videos into courses, share them with learners, and review questions and answer quality.

**[https://videoq.jp/](https://videoq.jp/)**

![VideoQ Application Screenshot](assets/screenshot.png)

> **MCP integration supported** - Connect Claude Code and other MCP clients through OAuth or API keys.
>
> **New to the team?** Start with the [developer documentation](docs/README.md): [local setup](docs/getting-started/local-setup.md), [first walkthrough](docs/getting-started/first-walkthrough.md), and [codebase tour](docs/getting-started/codebase.md). Architecture and design references are also available there.

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite, TanStack Query → Cloudflare Pages |
| Web API | Hono + tRPC, Zod, Drizzle ORM → Cloudflare Workers |
| Authentication | Better Auth cookie sessions, API keys, OAuth provider; optional Google sign-in |
| Async jobs | Python worker → Amazon SQS / AWS Lambda |
| Database | Neon PostgreSQL + pgvector through Hyperdrive (local: PostgreSQL 17 + pgvector) |
| Object storage | Cloudflare R2 (local: MinIO) |
| Edge state | Durable Objects (rate limits, study sessions, task recovery scheduling) |
| External services | OpenAI / optional local AI, SearchAPI for YouTube transcripts, Mailgun email, Stripe billing |

Locally, `docker compose` runs Postgres, MinIO, ElasticMQ, the Hono API (`wrangler dev`), the Python worker, a static frontend build, and a Caddy gateway on port 80.

```text
Browser → Caddy → React (nginx)
               → Hono API → PostgreSQL / ElasticMQ (SQS)
Browser → MinIO (signed uploads)          ↓
                              Python worker → PostgreSQL / MinIO
```

The SPA shares the typed `/api/trpc` contract in `packages/trpc`. Hono also serves Better Auth, MCP, chat streaming, media, CSV exports, and the Stripe webhook. Browser authentication uses cookies; MCP uses API keys or OAuth access tokens.

Async processing runs transcription → scene indexing → PLOG generation. Jobs are recorded in a database outbox and delivered to SQS, and the worker tracks job IDs to handle retries. The `TASK_SCHEDULER` Durable Object schedules recovery for pending deliveries and abandoned uploads. A daily `17 3 * * *` UTC cron performs retention cleanup and recovery; there is no five-minute polling cron.

Package READMEs: [`apps/`](apps/README.md) · [`apps/api/`](apps/api/README.md) · [`apps/web/`](apps/web/README.md) · [`apps/worker/`](apps/worker/README.md)

## Features

- **Upload supported video formats** - MP4, MOV, AVI, MKV, WebM, M4V, MPEG, 3GP, and more
- **Import YouTube lectures** - Retrieve transcripts using a SearchAPI key saved in your settings
- **Ask questions with sources** - Chat across course videos and jump to the cited scenes
- **Guided study with PLOG** - Learn through concept questions and hints; inspect, edit, merge, and rebuild concepts and relationships from the video detail page
- **Organize with tags** - Manage videos with custom tags and colors
- **Share courses** - Group videos into courses, create share links, and invite members by email
- **Review learning activity** - View chat history, feedback, analytics, CSV exports, and RAGAS answer evaluations
- **Manage usage and plans** - Administer users, storage and monthly quotas, reindex jobs, and optional Stripe subscriptions
- **Multilingual UI** - Switch between Japanese and English interfaces
- **MCP integration** - Manage videos and courses and analyze chat history from Claude Code

PLOG (Prerequisite-aware Learning-Object Graph) is built after scene indexing. The current worker extracts concepts, opening questions, and hints, then connects concepts in a prerequisite chain. Study mode needs a graph with a usable ordering path. See the [PLOG notes](docs/plog/README.md) and [current builder](apps/worker/worker_python/pipeline/plog_build.py) for design context and implementation.

## Quick Start

### Requirements

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed
- An [OpenAI API key](https://platform.openai.com/api-keys) for the default AI configuration
- A [SearchAPI API key](https://www.searchapi.io/) if you want to import YouTube videos (configured per user in Settings)
- Node.js 22.12+ and npm for the account promotion command below and development outside Docker
- Python 3.12+ only if you run or test the Python worker outside Docker

### Step 1: Get an OpenAI API key for the default setup

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key, which starts with `sk-...`

The setup below uses OpenAI for transcription, embeddings, chat, PLOG generation, and answer evaluation. Optional local AI configuration is described [below](#optional-reduce-costs-with-local-ai).

### Step 2: Set up VideoQ

```bash
# Clone the project and enter the directory
git clone https://github.com/yukiharada1228/videoq.git
cd videoq

# Copy the environment file
cp .env.example .env
```

Open `.env` and set at least:

```bash
OPENAI_API_KEY=sk-proj-...
OPENAI_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
WHISPER_BACKEND=openai
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_VECTOR_SIZE=1536

# Docker API startup currently forwards AUTH_JWT_SECRET as the auth fallback.
# AUTH_JWT_SECRET: openssl rand -base64 48
# USER_SECRET_ENCRYPTION_KEY: openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
AUTH_JWT_SECRET=
USER_SECRET_ENCRYPTION_KEY=
```

**Set `EMBEDDING_VECTOR_SIZE=1536` even though `.env.example` currently says `1024`.** The current Drizzle schema and migration history define `scene_embeddings.embedding` as `vector(1536)`. API queries and worker indexing must use the same model and vector dimensions.

Docker Compose supplies development-only fallback secrets when these fields are blank. The API container generates `apps/api/.dev.vars` using [`docker-dev.sh`](apps/api/scripts/docker-dev.sh), which currently forwards `AUTH_JWT_SECRET`, not `BETTER_AUTH_SECRET`. Host-run API development and production use `BETTER_AUTH_SECRET` directly. Configure independent secrets for shared deployments.

### Step 3: Start VideoQ

```bash
# Start all services. The first run may take a few minutes.
# Drizzle migrations run automatically via the `migrate` service.
docker compose up --build -d
```

Check service state and logs if startup or video processing fails:

```bash
docker compose ps -a
docker compose logs --tail=100 migrate api worker
```

`migrate` and `minio-init` are one-shot services; exiting with code 0 is expected. The API provides `/health` for liveness and `/ready` for database readiness, both accessible through `http://localhost`.

Optional Vite HMR for frontend work:

```bash
docker compose --profile dev up -d web-dev
# → http://localhost:3000
```

### Step 4: Create an admin user

1. Open [http://localhost/signup](http://localhost/signup) and create an account.
2. Complete email verification if Mailgun is configured.
   For a bare local stack without Mailgun, promote the account
   (this also activates it):

```bash
npm ci
npm run user:superuser --workspace @videoq/api -- your-username-or-email
```

If a migrated local account reports `Password not found`, restore a local-only
temporary password (the command prints it once):

```bash
npm run user:password:local --workspace @videoq/api -- your-username-or-email
```

3. Log in at [http://localhost/login](http://localhost/login).

### Step 5: Start using VideoQ

Open [http://localhost](http://localhost) in your browser.

**Useful links:**

- **Admin UI:** [http://localhost/admin](http://localhost/admin) for users, quotas, and reindex jobs
- **MinIO console:** [http://localhost:9001](http://localhost:9001) (default `minioadmin` / `minioadmin`)
- **API:** [http://localhost:8787/health](http://localhost:8787/health)
- **PostgreSQL:** `127.0.0.1:55432`
- **ElasticMQ:** `http://127.0.0.1:9324` (SQS endpoint), [statistics UI](http://localhost:9325)

**First steps:**

1. Log in with the account you promoted
2. Upload a video, or save a SearchAPI key in Settings and import a YouTube lecture
3. Create a course, add videos, wait for processing, and ask a question
4. Open cited scenes or switch to Study once PLOG generation is ready

### Free tier on signup

New accounts receive a monthly free tier automatically (override per user later in Admin):

| Setting | Default |
|----------|-------------|
| Max video upload size (MB) | 200 (`MAX_VIDEO_UPLOAD_SIZE_MB`) |
| Storage limit (GB) | 1 (`DEFAULT_STORAGE_LIMIT_GB`) |
| Processing limit (minutes / month) | 45 (`DEFAULT_PROCESSING_LIMIT_MINUTES`) |
| AI answers limit (per month) | 30 (`DEFAULT_AI_ANSWERS_LIMIT`) |

The `DEFAULT_*` quota variables accept `null` or `unlimited` for no cap; `0` is a hard zero quota. `MAX_VIDEO_UPLOAD_SIZE_MB` is a numeric upload limit. In Admin, leave nullable quota fields blank to set unlimited. AI answers and processing usage reset each UTC month.

For Docker development, use Admin to change user quotas. API runtime variables come from `wrangler.jsonc` and the subset written by `docker-dev.sh`; adding an arbitrary API variable to the root `.env` does not automatically expose it to Hono. In particular, signup quota overrides are not currently forwarded by that script.

<details>
<summary><strong>Optional: object storage notes (MinIO / R2 / S3)</strong></summary>

**Local default:** Docker Compose starts MinIO and configures the API + worker to use it. Browser uploads go to `http://127.0.0.1:9000`.

**Production:** Use Cloudflare R2 (or another S3-compatible store). Set the API secrets / vars described in [`infra/DEPLOY.md`](infra/DEPLOY.md), including `R2_*` credentials and `USE_S3_STORAGE=true` for the worker / frontend as needed. Browser uploads also require the versioned R2 CORS policy in `apps/api/r2-cors.production.json`.

Example API runtime variables / secrets for R2:

```bash
USE_S3_STORAGE=true
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-bucket
R2_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_S3_REGION=auto
```

The deployed API uses the `VIDEO_BUCKET` binding for object metadata and deletion. The R2 S3 credentials are used to sign browser URLs and by the Python worker. In Lambda, store R2 credentials under `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`; AWS credential variables belong to the execution role.

The checked-in Compose stack explicitly configures MinIO endpoints and credentials. Switching it to external storage requires updating those service settings as well as browser CORS and the publicly reachable storage URL.

After editing runtime values in the root `.env`, recreate affected containers to load them:

```bash
docker compose up -d --force-recreate api worker
```

Frontend `VITE_*` values are build-time settings; changes require rebuilding `web`.

</details>

<a id="optional-reduce-costs-with-local-ai"></a>

<details>
<summary><strong>Optional: reduce costs with local AI</strong></summary>

**This step is optional.** Skip it if the default OpenAI setup works for you.

Transcription, chat, and embeddings can use local services. Configure each component together with the API and worker that consume it.

<details>
<summary><strong>Local transcription with whisper.cpp</strong></summary>

Build the bundled submodule with CMake and a C++ toolchain. Performance depends on the model and available hardware.

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
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin \
  --host 0.0.0.0 --port 8080 --inference-path /audio/transcriptions -l ja
```

**Configure VideoQ:**

In another terminal at the VideoQ root, edit `.env`:

```bash
WHISPER_BACKEND=whisper.cpp
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

Recreate the worker to load the changed environment:

```bash
docker compose up -d --force-recreate worker
```

</details>

<details>
<summary><strong>Local chat with Ollama</strong></summary>

**Install Ollama:**

1. Download it from [ollama.com](https://ollama.com)
2. Install and run it

**Pull a model:**

```bash
ollama pull qwen3-vl:8b-instruct
```

**Configure VideoQ:**

Edit `.env`:

```bash
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=qwen3-vl:8b-instruct
```

Chat uses Ollama's [OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility)
through ChatOpenAI. Course QA requires a model with tool calling support.
`OPENAI_API_KEY=ollama` is a placeholder for local Ollama and cannot authenticate to OpenAI. `OPENAI_BASE_URL` is also used by OpenAI-provider embeddings and the Python OpenAI client, so changing it in the shared `.env` affects more than chat. A shared local configuration also needs local Whisper, compatible embeddings, and a model that supports the worker's JSON PLOG output. For a mixed setup, configure the API and worker environments separately.

For `npm run dev:api` outside Docker, put these values in `apps/api/.dev.vars`
and use `OPENAI_BASE_URL=http://127.0.0.1:11434/v1`.

Recreate the affected containers after updating the shared `.env`:

```bash
docker compose up -d --force-recreate api worker
```

</details>

<details>
<summary><strong>Local embeddings with Ollama</strong></summary>

Set `EMBEDDING_PROVIDER=ollama` and `EMBEDDING_MODEL` to your installed embedding model. For Docker, use `OLLAMA_BASE_URL=http://host.docker.internal:11434` and `WORKER_OLLAMA_BASE_URL=http://host.docker.internal:11434`.

The model must emit vectors matching the database column. The current schema uses **1536 dimensions**, while the `qwen3-embedding:0.6b` example in the local configuration uses 1024. Setting `EMBEDDING_VECTOR_SIZE` does not resize Ollama output: the current Ollama adapter does not send a dimensions parameter. Use a compatible model, or change the Drizzle schema through a generated migration and rebuild the vectors before using a different dimension.

For `npm run dev:api` outside Docker, set the embedding values in
`apps/api/.dev.vars` and use `OLLAMA_BASE_URL=http://127.0.0.1:11434`.
The API and indexing worker must use the same embedding model and dimensions.

Recreate the API and worker containers to load the updated `.env`:

```bash
docker compose up -d --force-recreate api worker
```

After switching models or providers, reindex existing videos from Admin. Rebuild their PLOG artifacts as well so concept embeddings use the same model. A dimension change also needs a database migration; reindexing alone does not change the column type.

</details>

</details>

## Development

Run npm commands from the repository root. Dependencies for `apps/api`, `apps/docs`, `apps/web`, and `packages/trpc` share the root lockfile.

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs API unit / Workers runtime tests and frontend tests. API database integration tests additionally require `QUOTA_TEST_DATABASE_URL` pointing to a test PostgreSQL instance with pgvector and permission to create test databases.

### Documentation site

Read the published docs in [English](https://docs.videoq.jp/) or [日本語](https://docs.videoq.jp/ja/).

The Docusaurus site reads English Markdown from [`docs/`](docs/README.md) and Japanese
translations from `apps/docs/i18n/ja/docusaurus-plugin-content-docs/current/`.
English is the default at `/`; the header language menu switches to Japanese at `/ja/`.
Both languages include Mermaid diagrams and local full-text search.
Documentation changes merged into `main` are automatically published by
[CD](.github/workflows/cd.yml) after CI succeeds.

```bash
npm run dev:docs      # http://localhost:3001
npm run dev:docs -- --locale ja  # Japanese only: http://localhost:3001/ja/
npm run build:docs    # Both languages: apps/docs/build
npm run preview:docs  # Preview the build, including search, on port 3001
npm run deploy:docs   # Build and publish the current working tree to docs.videoq.jp
```

The development server runs one language at a time. Build and preview to check
the language switcher and search; search indexes are generated during the build. See
[`apps/docs/README.md`](apps/docs/README.md) for editing and hosting settings.

### Frontend and API on the host

For frontend-only work against the Compose API:

```bash
VITE_API_URL=/api VITE_USE_S3_STORAGE=true npm run dev:web
# http://localhost:3000; Vite proxies /api to 127.0.0.1:8787
```

To also run Hono outside Docker, stop the Compose API to release port 8787, then prepare Wrangler's variables:

```bash
docker compose stop api
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Set `BETTER_AUTH_SECRET`, `USER_SECRET_ENCRYPTION_KEY`, and `OPENAI_API_KEY` in `apps/api/.dev.vars`. For the OpenAI setup above, also set:

```dotenv
BETTER_AUTH_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3000
OAUTH_ISSUER_URL=http://localhost:3000
OPENAI_BASE_URL=https://api.openai.com/v1
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_VECTOR_SIZE=1536
```

Keep the MinIO / ElasticMQ settings from `.dev.vars.example`, use the same user-secret encryption key as the Python worker, then run `npm run dev:api` in another terminal. Wrangler's local Hyperdrive connection targets `localhost:55432`; override it if you changed the database credentials. The Compose dependencies and Python worker continue running.

Restarting the Compose API regenerates `.dev.vars`, so keep host-only configuration separately if you switch between these workflows. MCP OAuth discovery additionally needs `/.well-known/*` forwarding, as shown in [`Caddyfile.dev`](Caddyfile.dev); Vite currently proxies `/api`, `/health`, and `/ready` only.

### Database changes

Edit [`apps/api/src/db/schema/`](apps/api/src/db/schema/), then generate and verify migrations:

```bash
npm run db:generate -- --name describe_the_schema_change
npm run db:check
npm run db:verify
npm run db:migrate
```

Do not hand-edit generated DDL SQL, snapshots, or the journal. Data-only backfills use `npm run db:generate:custom -- --name describe_the_data_change` and must start with `-- drizzle-kit:custom`; custom migrations must not contain DDL. `db:verify` checks migration provenance, and the API database integration tests apply the full migration history to an empty database.

`db:migrate` uses `DATABASE_URL` when exported, otherwise the local `postgres:postgres` connection on port 55432. Root `.env` values are not automatically loaded by Drizzle Kit. See the [API README](apps/api/README.md) for details.

### Python worker

```bash
cd apps/worker
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m pytest tests/ -q
```

PostgreSQL integration tests additionally use `DATABASE_URL`. Running transcription outside Docker requires FFmpeg and the database, storage, queue, and AI environment settings described in the [worker README](apps/worker/README.md).

## Deployment

The production topology is Cloudflare Pages + Workers + Hyperdrive, Neon PostgreSQL, Cloudflare R2, and an ARM64 Python Lambda consuming SQS. Follow [`infra/DEPLOY.md`](infra/DEPLOY.md) for provisioning, secrets, migrations, CORS, and deployment checks.

- Frontend: Cloudflare Pages Git integration, root `apps/web`, build `npm run build`, output `dist`.
- API and worker: [GitHub Actions CD](.github/workflows/cd.yml) applies database migrations before deployment. Terraform in `infra/` manages AWS resources.
- Authentication: configure `BETTER_AUTH_SECRET`, public URLs, and Mailgun for verification / invitation email; Google sign-in is optional.
- Billing: configure Stripe keys, products, and the webhook using the [billing setup](docs/billing/stripe-dashboard.md).

### HTTPS with Docker Compose

Caddy accepts a public hostname through `SITE_ADDRESS`, but the checked-in stack runs `wrangler dev` with development settings and signs uploads for `http://127.0.0.1:9000`. Setting a domain in `.env` alone does not configure a public deployment: authentication origins, CORS, API variable forwarding, secrets, and a browser-accessible HTTPS storage endpoint also need configuration. Use the production deployment guide above for the maintained cloud setup.

## MCP (Model Context Protocol) Integration

VideoQ exposes a remote MCP server at `/api/mcp` (Streamable HTTP via `@hono/mcp`). Connect a compatible client using the endpoint URL and an API key, or use the OAuth authorization flow. Older clients can use the `mcp-remote` bridge below.

> 🛡️ **Permission policy:** Read tools accept `read_only` API keys or OAuth tokens with `videoq.read`. Video upload and course management tools require an `all` API key or the OAuth `videoq.write` scope. Missing API-key permission metadata defaults to read-only. Sending RAG chat questions is intentionally excluded from MCP.

### Available tools

VideoQ exposes 9 read-only tools and 5 write tools. The MCP metadata and tests enforce
that split, including each tool's input/output schema and safety annotations.

| Tool | Purpose |
|---|---|
| `list_videos` / `get_video` | List videos and view details (with opt-in, bounded transcript chunks) |
| `request_video_upload` / `confirm_video_upload` | Upload a local video through a signed object-storage URL and start processing |
| `create_youtube_video` | Register and import a YouTube lecture URL |
| `list_courses` / `get_course` | List courses and their member videos |
| `create_course` | Create a course |
| `add_video_to_course` | Add an uploaded video to a course |
| `list_tags` | List tags |
| `get_chat_history` | Chat history for a course (with feedback) |
| `get_chat_analytics` | Question counts, period, daily time series, feedback aggregates |
| `get_evaluation_summary` | RAGAS average scores (faithfulness / answer_relevancy / context_precision) |
| `list_evaluation_logs` | Per-log RAGAS scores |

List tools support `limit` / `offset` pagination. General lists default to 20 and allow at most 100 items; chat history and evaluation logs default to 10 and allow at most 25. `get_course` paginates member videos separately with `video_limit` / `video_offset`. `get_video` omits the transcript by default; request bounded chunks with `include_transcript`, `transcript_offset`, and `transcript_limit`.

The three create/reserve tools (`request_video_upload`, `create_youtube_video`, and `create_course`) require an `idempotency_key`. Generate one stable value per logical operation and reuse it only when retrying the same arguments. Upload confirmation and course membership addition are also safe to retry.

### Setup

#### Step 1: Issue an integration API key

Log in to VideoQ and issue a `vq_...` key from **Settings → Integration API Keys**, then copy it. Select `all` to upload videos or manage courses; `read_only` is enough for analytics.

#### Step 2: Register the endpoint with your MCP client

The endpoint URL is your VideoQ host followed by `/api/mcp` — for example, `http://localhost/api/mcp` for a local Docker setup or `https://your-domain.example.com/api/mcp` in production. Authenticate with `Authorization: Bearer vq_...` (or the equivalent `X-API-Key` header).

For **Claude Code**:

```bash
claude mcp add --transport http videoq https://your-domain.example.com/api/mcp \
  --header "Authorization: Bearer vq_xxxxxxxxxxxxxxxx"
```

For **Claude Desktop / claude.ai (built-in connector, OAuth 2.1)**, paste just the MCP URL into **Settings → Connectors → Add custom connector** and approve the consent screen. No API key needed — VideoQ implements OAuth 2.1 + Dynamic Client Registration (RFC 7591) per the MCP Authorization spec.

```
https://your-domain.example.com/api/mcp
```

The client discovers the authorization server through `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server/api/auth`, registers at `/api/auth/oauth2/register`, and runs the authorization-code flow with PKCE. The authorization server issuer is `{public-origin}/api/auth`, and the protected resource is `{public-origin}/api/mcp`. VideoQ enforces `videoq.read` / `videoq.write` scopes. Revoke grants from **Settings → Connected Apps**.

For your own production instance, complete the [deployment setup](infra/DEPLOY.md). Set the API runtime URL variables to the public HTTPS origin:

```dotenv
BETTER_AUTH_URL=https://videoq.example.com
FRONTEND_URL=https://videoq.example.com
OAUTH_ISSUER_URL=https://videoq.example.com
```

After deployment, confirm that the MCP endpoint and OAuth metadata are reachable before registering the connector (an unauthenticated MCP request can return `401`):

```text
https://videoq.example.com/api/mcp
https://videoq.example.com/.well-known/oauth-authorization-server/api/auth
https://videoq.example.com/.well-known/oauth-protected-resource/api/mcp
```

If you need to fall back to the `mcp-remote` bridge for an older client, configure it with your API key instead:

```json
{
  "mcpServers": {
    "videoq": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-domain.example.com/api/mcp",
        "--header",
        "Authorization: Bearer vq_xxxxxxxxxxxxxxxx"
      ]
    }
  }
}
```

Config file locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Cursor** and other Streamable HTTP-capable clients use the same URL + header pattern.

#### Step 3: Verify

Restart the client and confirm that the MCP server appears as `videoq`. Try prompts like "Create a course named Physics", "Upload lecture.mp4 and add it to the Physics course", or "Analyze the chat history for course 1".

For a local file, Claude Code generates an idempotency key, calls `request_video_upload`, uploads the file with an HTTP `PUT` using the returned URL and required headers, and then calls `confirm_video_upload`. The video bytes do not pass through the Worker or MCP JSON payload. Retrying the prepare call after confirmation returns the current video state without minting an overwrite-capable PUT URL.

### Troubleshooting

- **`401 Unauthorized`** → The API key (or OAuth token) is missing, malformed, or revoked. Reissue from Settings and update the header, or re-approve the OAuth connector.
- **`404 Not Found`** → The URL is wrong. Confirm the host and the `/api/mcp` path.
- **OAuth connector cannot discover the server** → Confirm that `https://<host>/.well-known/oauth-authorization-server/api/auth` and `https://<host>/.well-known/oauth-protected-resource/api/mcp` return JSON. Reverse proxies must forward `/.well-known/*` to Hono, and metadata must advertise the public origin.

## Repository layout

```text
apps/api/        Hono + tRPC on Cloudflare Workers
apps/web/        React SPA
apps/worker/     Python async pipeline (SQS / Lambda)
packages/trpc/   Shared Hono ↔ React tRPC router and contract
package.json     npm workspace root
infra/           Terraform (SQS, Lambda, ECR, IAM) + deploy notes
docs/            Architecture and design docs
whisper.cpp/     Optional local transcription server (Git submodule)
.github/workflows/   CI, CD, Terraform, Cloudflare resource management
docker-compose.yml   Local full stack
Caddyfile.dev        Local gateway and protocol routing
```

## Contributing

Found a bug or want to add a feature? Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests as needed
5. Submit a pull request

For frontend UI changes, follow the [Storybook change and review workflow](apps/web/STORYBOOK.md) to update the relevant stories and share verification results in your PR.

## Citation

- 藤吉 弘亘. "AIと共に生きる時代における教育への生成 AI 活用：「藤吉 AI先生」". 情報処理学会 会誌「情報処理」 Vol.66, No.11 (2025).
  - [https://ipsj.ixsq.nii.ac.jp/records/2004788](https://ipsj.ixsq.nii.ac.jp/records/2004788)

## License

See the [LICENSE](LICENSE) file for details.
