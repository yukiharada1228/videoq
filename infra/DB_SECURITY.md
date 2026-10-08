# Production database permissions and credentials

This guide covers the `production` branch (`br-plain-fog-a1tapmzu`) of the Neon
project `videoq` (`frosty-feather-64812505`). When checked on 2026-09-18, production
was the project's only branch.

## Connections by purpose

| Purpose | PostgreSQL role | Storage location |
|---|---|---|
| Workers API / Lambda | `videoq_app_20260918` | Hyperdrive `videoq-neon-prod` / SSM `/videoq/prod/db` |
| DB migration | `videoq_migrate_20260918` | GitHub `production-app.DATABASE_URL` / recovery SSM `/videoq/security/prod/db-migration` |
| Administration and disaster recovery | `neondb_owner` | SSM `/videoq/security/prod/db-admin` |

Each SSM value is a JSON `SecureString` with a `DATABASE_URL` key. Migration and
administration use Neon's direct endpoint; the application uses the existing
pooler endpoint. TLS is required. Keep administration and migration parameters
separate from the normal `/videoq/prod/*` parameters and inaccessible to the app.
These recovery parameters are managed manually. Before bringing them under
Terraform, import them and configure `ignore_changes` for their values and
deletion protection.

The Lambda execution role `videoq-worker-prod` can read only `/videoq/prod/db` and
`/videoq/prod/app` from SSM. Do not store administrative connection details in
these parameters. Do not store `DATABASE_URL` in GitHub Repository secrets.

## Database permissions

- The application role has `SELECT / INSERT / UPDATE / DELETE` on existing tables
  in `public` and `USAGE / SELECT` on sequences. It does not own tables and has no
  CREATE on `public`, CREATE on the database, TRUNCATE, or USAGE on the `drizzle`
  schema.
- The migration role owns application tables and sequences in `public` and
  `drizzle`. It has the permissions required to create and change schemas. The
  administration role owns the existing `vector` extension and the database
  itself. Installing a new extension is an administrative task.
- Both roles have `NOSUPERUSER / NOCREATEDB / NOCREATEROLE / NOREPLICATION /
  NOBYPASSRLS`. Neither receives membership in `neon_superuser` or the
  administration role.
- The migration role's `ALTER DEFAULT PRIVILEGES` grants the application role
  data-access permissions on future tables and sequences in `public`. These
  defaults do not apply when migrations run as a different role.
- `neondb_owner` is for administration only. It has membership allowing it to
  manage the application and migration roles; those roles do not have membership
  in `neondb_owner`.

Roles created through the Neon Console or API receive `neon_superuser`, so create
restricted roles [through SQL](https://neon.com/docs/manage/roles#manage-roles-with-sql).
Separating database roles does not replace the application's per-user access
controls.

## Rotation sequence

1. Confirm the target project, branch, database, and consumers, and avoid
   overlapping deployments. Neon roles and passwords belong to a branch; check
   any cloned branches separately.
2. Generate a new password with sufficient randomness and create a new role for
   the required purpose through SQL. Keep the value out of command arguments,
   logs, chat, and Git.
3. Transfer ownership of application objects to the new migration role and set
   its default privileges. Within a transaction, verify that application DML
   succeeds, DDL is denied, and new tables receive the automatic grants.
4. Update the migration recovery parameter in SSM and the GitHub Environment
   secret. Confirm that `npm run db:migrate --workspace @videoq/api` succeeds on
   the current main branch.
5. Update the Hyperdrive origin username/password and the application's SSM
   parameter. Keep Hyperdrive query caching disabled. Existing connection pools
   may survive a configuration change, so also
   [verify the connection transition](https://developers.cloudflare.com/hyperdrive/configuration/rotate-credentials/).
6. Lambda reads SSM only once per warm container. Refresh its execution
   environments, for example by reapplying the same image digest. Updating SSM
   alone does not complete the switch.
7. Check the API's `/health` and `/ready`, database reads and writes from Lambda,
   and migrations. Keep the old credentials valid until this point so you can
   roll back if necessary.
8. Change the administration role's old password, or set the old purpose-specific
   role to NOLOGIN to disable authentication. Do not drop a role while it still
   owns objects. Check for remaining sessions under old roles and close them
   after their active work finishes. Verify that the old password cannot open
   new connections through either the direct or pooler endpoint.
9. Recheck the API and Lambda after disabling the old credentials, then remove
   test records.

Resetting only Neon's administrative user first disconnects consumers whose
configuration has not been updated. If a leak is suspected, weigh the urgency
against the impact of connection interruptions.
