# Django migrations FROZEN

**Schema ownership moved to `backend-hono` (Drizzle).**

Do not add new Django migrations. DDL changes must be authored with:

```bash
cd backend-hono
npx drizzle-kit generate
# apply via your migrate pipeline — never destructive push to prod
```

See `docs/architecture/django-cutover.md`.
