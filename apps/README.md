# apps/

Production application packages. There is no top-level `backend/` anymore.

| Directory | Role | Runtime |
|---|---|---|
| [`api/`](api/) | Web API (Hono + Drizzle) | Cloudflare Workers |
| [`worker/`](worker/) | Async jobs (transcription, indexing, PLOG, …) | Python / SQS Lambda |

Historical Django: [`archive/django-backend/`](../archive/django-backend/).

```bash
# One-shot local stack (Caddy → nginx 静的 FE + Hono + worker + infra)
docker compose up --build -d
# → http://localhost
# FE HMR が必要なら: docker compose --profile dev up -d web-dev
```
