# VideoQ

**Jump instantly to the scenes you want by asking AI questions**

VideoQ is an AI-powered video navigator that automatically transcribes videos and lets you chat with them in natural language.

**[https://videoq.jp/](https://videoq.jp/)**

![VideoQ Application Screenshot](assets/screenshot.png)

> **MCP integration supported** - Connect Claude Code and other MCP clients through OAuth or API keys.
>
> **Design documentation** - See [docs/](docs/README.md) for architecture diagrams, ER diagrams, sequence diagrams, and other technical details.

## Architecture

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite → Cloudflare Pages |
| Web API | Hono + tRPC, Zod, Drizzle ORM → Cloudflare Workers |
| Async jobs | Python worker → Amazon SQS / AWS Lambda |
| Database | Neon PostgreSQL + pgvector (local: Docker Postgres) |
| Object storage | Cloudflare R2 (local: MinIO) |
| Edge state | Durable Objects (rate limits and study sessions) |

Locally, `docker compose` runs Postgres, MinIO, ElasticMQ, the Hono API (`wrangler dev`), the Python worker, a static frontend build, and a Caddy gateway on port 80.

```text
Browser → Caddy → React (nginx) + Hono API
                      ↓              ↓
                 MinIO / Postgres ← Python worker ← ElasticMQ (SQS)
```

Package READMEs: [`apps/`](apps/README.md) · [`apps/api/`](apps/api/README.md) · [`apps/web/`](apps/web/README.md) · [`apps/worker/`](apps/worker/README.md)

## Features

- **Upload supported video formats** - MP4, MOV, AVI, MKV, WebM, M4V, MPEG, 3GP, and more
- **Ask questions** - For example, "What did they say about the budget?" or "Summarize the key points"
- **Search video content** - Find specific moments without scrubbing through hours of footage
- **Organize with tags** - Manage videos with custom tags and colors
- **Share insights** - Create shareable video courses for team collaboration
- **Multilingual UI** - Switch between Japanese and English interfaces
- **MCP integration** - Manage videos and courses and analyze chat history from Claude Code

## Quick Start (5 minutes)

### Requirements

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed
- An [OpenAI API key](https://platform.openai.com/api-keys) for the default AI configuration
- A [SearchAPI API key](https://www.searchapi.io/) if you want to import YouTube videos (configured per user in Settings)
- Node.js 22+ if you want to promote a superuser or run packages outside Docker

### Step 1: Get an OpenAI API key for the default setup

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key, which starts with `sk-...`

The default setup uses OpenAI for transcription, embeddings, and chat. To run AI locally, see [Optional: reduce costs with local AI](#optional-reduce-costs-with-local-ai) below.

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

# Generate independent secrets (do not reuse across environments)
# BETTER_AUTH_SECRET: openssl rand -base64 48
# USER_SECRET_ENCRYPTION_KEY: openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost
USER_SECRET_ENCRYPTION_KEY=
```

Docker Compose also supplies safe local defaults for those secrets if you leave them blank during development. Always set unique values before any shared or production deployment.

### Step 3: Start VideoQ

```bash
# Start all services. The first run may take a few minutes.
# Drizzle migrations run automatically via the `migrate` service.
docker compose up --build -d
```

DB schemaを変更するときは、repository rootからDrizzle Kitでmigrationを生成します。

```bash
npm run db:generate -- --name describe_the_schema_change
npm run db:check
npm run db:verify
```

DDLのmigration SQL・snapshot・journalは手で編集しません。データbackfillだけは
`npm run db:generate:custom -- --name describe_the_data_change`でDrizzle管理下に作成し、
ファイル先頭を`-- drizzle-kit:custom`にします。CIは生成DDLとの完全一致と空DBへの全履歴適用を
検証します。

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

**First steps:**
1. Log in with the account you promoted
2. Configure upload / storage / processing limits for users from Admin
3. Upload a video, wait for transcription, and try chatting with it

### Free tier on signup

New accounts receive a monthly free tier automatically (override per user later in Admin):

| Setting | Default |
|----------|-------------|
| Max video upload size (MB) | 200 (`MAX_VIDEO_UPLOAD_SIZE_MB`) |
| Storage limit (GB) | 1 (`DEFAULT_STORAGE_LIMIT_GB`) |
| Processing limit (minutes / month) | 45 (`DEFAULT_PROCESSING_LIMIT_MINUTES`) |
| AI answers limit (per month) | 30 (`DEFAULT_AI_ANSWERS_LIMIT`) |

Use `null` or `unlimited` in those env vars for no cap. `0` is a hard zero quota. In Admin, leave a field blank to set unlimited (`null`). AI answers and processing usage reset each UTC month.

<details>
<summary><strong>Optional: object storage notes (MinIO / R2 / S3)</strong></summary>

**Local default:** Docker Compose starts MinIO and configures the API + worker to use it. Browser uploads go to `http://127.0.0.1:9000`.

**Production:** Use Cloudflare R2 (or another S3-compatible store). Set the API secrets / vars described in [`infra/DEPLOY.md`](infra/DEPLOY.md), including `R2_*` credentials and `USE_S3_STORAGE=true` for the worker / frontend as needed. Browser uploads also require the versioned R2 CORS policy in `apps/api/r2-cors.production.json`.

Example production-oriented values in `.env` / Worker secrets:

```bash
USE_S3_STORAGE=true
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-bucket
R2_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_S3_REGION=auto
```

Cloudflare API Worker内の`head` / `delete`は`VIDEO_BUCKET` bindingを使います。
上のS3 API tokenはブラウザ用署名URLとAWS Lambda workerからR2へ接続するために必要です。
Lambdaの実行環境では`AWS_ACCESS_KEY_ID`をR2キーとして使わないでください。

Restart the worker after changing storage credentials:

```bash
docker compose restart worker api
```

</details>

<a id="optional-reduce-costs-with-local-ai"></a>

<details>
<summary><strong>Optional: reduce costs with local AI</strong></summary>

**This step is optional.** Skip it if the default OpenAI setup works for you.

If you want to reduce costs or run more of the stack offline, you can switch to local models.

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

Restart the worker:

```bash
docker compose restart worker
```

</details>

<details>
<summary><strong>Local AI chat with Ollama as a free ChatGPT alternative</strong></summary>

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
`LLM_PROVIDER` is no longer used. Embeddings have their own settings below;
`OPENAI_API_KEY=ollama` is a placeholder for local Ollama and cannot authenticate to OpenAI.

For `npm run dev:api` outside Docker, put these values in `apps/api/.dev.vars`
and use `OPENAI_BASE_URL=http://127.0.0.1:11434/v1`.

Recreate the API container to load the updated `.env`:

```bash
docker compose up -d --force-recreate api
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
EMBEDDING_VECTOR_SIZE=1024
OLLAMA_BASE_URL=http://host.docker.internal:11434
WORKER_OLLAMA_BASE_URL=http://host.docker.internal:11434
```

For `npm run dev:api` outside Docker, set the embedding values in
`apps/api/.dev.vars` and use `OLLAMA_BASE_URL=http://127.0.0.1:11434`.
The API and indexing worker must use the same embedding model and dimensions.

Recreate the API and worker containers to load the updated `.env`:

```bash
docker compose up -d --force-recreate api worker
```

**Important:** If you switch embedding providers or dimensions, re-index existing videos from the Admin UI.

</details>

</details>

## HTTPS Deployment with Docker Compose

The default Docker Compose stack uses Caddy as its public gateway. Local development remains HTTP by default. Set a production DNS name to enable automatic Let's Encrypt certificate issuance, HTTP-to-HTTPS redirects, and certificate renewal.

1. Point the A/AAAA record for a stable domain (for example, `videoq.example.com`) to the server's public IP address.
2. Allow inbound TCP ports 80 and 443. UDP 443 is optional and enables HTTP/3.
3. Configure the production values in `.env`:

```dotenv
SITE_ADDRESS=videoq.example.com
FRONTEND_URL=https://videoq.example.com
CORS_ALLOW_ORIGIN=https://videoq.example.com
BETTER_AUTH_URL=https://videoq.example.com
BETTER_AUTH_SECRET=<openssl rand -base64 48>
USER_SECRET_ENCRYPTION_KEY=<base64url 32-byte key>
OPENAI_API_KEY=sk-...
```

4. Start the stack:

```bash
docker compose up -d --build
```

Once DNS is active and ports 80/443 are externally reachable, Caddy obtains and renews the certificate automatically. Open `https://videoq.example.com` to confirm that the application is available over HTTPS.

For the Cloudflare + Neon + R2 + Lambda production topology, see [`infra/DEPLOY.md`](infra/DEPLOY.md).

## MCP (Model Context Protocol) Integration

VideoQ exposes a remote MCP server at `/api/mcp` (Streamable HTTP via `@hono/mcp`). Any MCP client that speaks Streamable HTTP — Claude Code, Cursor, and any client that can launch `mcp-remote` — can connect with just a URL and an API key. No local process to install.

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

Behind the scenes the client discovers the authorization server via `/.well-known/oauth-protected-resource/api/mcp` and `/.well-known/oauth-authorization-server`, registers itself dynamically at `/api/auth/oauth2/register`, and runs the standard authorization-code flow with PKCE. VideoQ advertises and enforces `videoq.read` / `videoq.write` scopes. You can revoke any granted token at any time from **Settings → Connected Apps**.

For a self-hosted production instance, first complete the [Docker Compose HTTPS deployment](#https-deployment-with-docker-compose). The OAuth issuer must match the public HTTPS origin:

```dotenv
OAUTH_ISSUER_URL=https://videoq.example.com
```

```bash
docker compose up -d api gateway
```

Then confirm that the MCP endpoint and OAuth metadata are publicly available before registering the connector:

```text
https://videoq.example.com/api/mcp
https://videoq.example.com/.well-known/oauth-authorization-server
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
- **OAuth connector cannot discover the server** → Confirm that `https://<host>/.well-known/oauth-authorization-server` and `https://<host>/.well-known/oauth-protected-resource/api/mcp` return JSON. These paths must be served by the API host at the root (not under `/api/`), so reverse proxies must forward `/.well-known/oauth-*` to the Hono API.

## Repository layout

```text
apps/api/        Hono + tRPC on Cloudflare Workers
apps/web/        React SPA
apps/worker/     Python async pipeline (SQS / Lambda)
packages/trpc/   Shared Hono ↔ React tRPC router and contract
package.json     npm workspace root
infra/           Terraform (SQS, Lambda, ECR, IAM) + deploy notes
docs/            Architecture and design docs
poc/             Spike / verification projects
docker-compose.yml   Local full stack
```

## Contributing

Found a bug or want to add a feature? Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests as needed
5. Submit a pull request

## Citation

- 藤吉 弘亘. "AIと共に生きる時代における教育への生成 AI 活用：「藤吉 AI先生」". 情報処理学会 会誌「情報処理」 Vol.66, No.11 (2025).
  - [https://ipsj.ixsq.nii.ac.jp/records/2004788](https://ipsj.ixsq.nii.ac.jp/records/2004788)

## License

See the [LICENSE](LICENSE) file for details.
