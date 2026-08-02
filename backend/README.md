# `backend/` — retired

Django Web API and the Celery/Django worker have been cut over.

| Role | Location |
|---|---|
| Web API | [`backend-hono/`](../backend-hono/) (Cloudflare Workers + Hono + Drizzle) |
| Async worker | [`worker-python/`](../worker-python/) (SQS Lambda, **no Django/Celery**) |
| Historical Django tree | [`archive/django-backend/`](../archive/django-backend/) (reference only — do not deploy) |
| Cutover notes | [`docs/architecture/django-cutover.md`](../docs/architecture/django-cutover.md) |

Schema ownership: Drizzle (`backend-hono/drizzle/`). Django migrations are frozen under the archive.
