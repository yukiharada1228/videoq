# Archived Django backend

This tree is **frozen historical reference** after the Hono + Drizzle + django-free worker cutover.

- Do **not** deploy API Lambda / run `manage.py runserver` in production.
- Do **not** add Django migrations (schema owned by `backend-hono` Drizzle).
- Worker runtime is [`worker-python/`](../../worker-python/).
- See [`docs/architecture/django-cutover.md`](../../docs/architecture/django-cutover.md).
