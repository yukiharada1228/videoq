# apps/

Runnable packages for VideoQ.

| Directory | Role | Runtime |
|---|---|---|
| [`api/`](api/) | tRPC API and protocol transports | Hono / Cloudflare Workers |
| [`docs/`](docs/) | Site for browsing and searching the design documentation in `../docs/` | Docusaurus |
| [`web/`](web/) | Browser application | React / Vite |
| [`worker/`](worker/) | Asynchronous processing, including transcription, indexing, and evaluation | Python / SQS Lambda |

Node.js packages are managed through npm workspaces at the repository root.

```bash
npm ci
npm run dev:api
npm run dev:web
npm run dev:docs
```

Start the full local stack:

```bash
docker compose up --build -d
```

To enable frontend HMR:

```bash
docker compose --profile dev up -d web-dev
```
