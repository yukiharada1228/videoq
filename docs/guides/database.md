---
title: Change the database
description: Generate migrations from Drizzle definitions and apply them to your local database.
---

# Change the database

Start DB changes in the Drizzle schema definitions written in TypeScript. A **migration** records changes that move an existing database to a new structure.

Prerequisite: PostgreSQL from the [local environment](../getting-started/local-setup.md) is running. These instructions target your own development database.

## Where definitions live

| Location | Contents |
|---|---|
| `apps/api/src/db/schema/modern.ts` | Business data such as videos, courses, chat, and PLOG |
| `apps/api/src/db/schema/better-auth.ts` | Sessions, authentication, OAuth, and related data |
| `apps/api/src/db/schema/index.ts` | Schema exports |
| `apps/api/drizzle/` | Generated SQL and schema change history |

`modern` is a file name. Use this schema as the source of truth instead of adding duplicate tables to another model definition.

## Change columns or tables

1. Edit the schema definition.
2. Decide how to handle existing rows. Adding a required column may need a default or backfill.
3. Generate a migration and review the diff.

```bash
npm run db:generate -- --name describe_the_schema_change
npm run db:check
npm run db:verify
```

Do not manually edit generated SQL, snapshots, or journals. If a correction is needed, revisit the schema and generation steps. `db:verify` checks consistency between the generated history and SQL, among other things.

## Apply locally

This example explicitly selects the default local database. Adjust the credentials if you changed them.

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres npm run db:migrate
```

After applying the migration, check both the API and worker code that reads or writes the affected columns. The API uses Drizzle, while the Python worker also contains SQL that reads the same tables.

## Change data only

Use a custom migration to backfill existing rows:

```bash
npm run db:generate:custom -- --name describe_the_data_change
```

Add `-- drizzle-kit:custom` at the start of the generated custom migration. Use it for data backfills, not structural changes to tables, columns, or indexes.

## Verify

For schema changes, run type checking and integration tests against a dedicated test database. See [tests and verification commands](testing.md). In shared and production environments, apply reviewed migrations through the deployment process instead of using `drizzle-kit push`.

Changing the embedding model configuration does not change the database's vector dimensions. The current `scene_embeddings.embedding` column has 1536 dimensions.

**Related:** [Data dictionary](../database/data-dictionary.md), [Reading the ER diagram](../database/er-diagram.md).
