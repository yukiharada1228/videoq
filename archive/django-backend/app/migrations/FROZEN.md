# Django migrations FROZEN

**Schema ownership moved to `apps/api` (Drizzle).**

Do not add new Django migrations. DDL changes must be authored with:

```bash
cd apps/api
npx drizzle-kit generate
# apply via your migrate pipeline — never destructive push to prod
```

See `docs/architecture/django-cutover.md`.
