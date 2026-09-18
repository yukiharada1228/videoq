---
title: Change the API
description: Trace changes from tRPC inputs and outputs through Hono handlers, services, and the database.
---

# Change the API

Start changes to regular JSON APIs in the shared contracts in `packages/trpc`. Hono handles HTTP requests and connects them to the API's implementation handlers.

This project uses **tRPC**, separately from the `hc` RPC client described in Hono's documentation. The endpoint is `/api/trpc`.

## Run the API while editing

Start the [development environment](../getting-started/local-setup.md). The Compose API mounts the source code, and Wrangler's development server reloads changes. Check request results alongside the logs:

```bash
docker compose logs -f api
```

Rebuild the API image as needed after changing dependencies or Docker configuration.

## Example: follow tag creation inputs

`packages/trpc/src/inputs/tags.ts` defines tag creation inputs as follows:

```ts
"tags.create": z.object({
  name: z.string().min(1).max(50),
  color: tagColorSchema.default("gray"),
}),
```

This is an excerpt of the existing definition. `name` must contain 1–50 characters, and the color defaults to `gray`. Validation and defaults are defined here.

## Order of changes

1. **Define inputs.** Set accepted values, constraints, and defaults in `packages/trpc/src/inputs/`.
2. **Define outputs.** Check the response shape in `outputs.ts` / `model-schemas.ts`.
3. **Register the operation.** Choose a query or mutation and its authentication requirements in `routers/`.
4. **Connect the API.** Pass inputs and the user ID to the service in `apps/api/src/trpc/handlers/`.
5. **Implement business logic.** Coordinate operations in `features/<feature>/service.ts` and put DB access in `repositories/`.
6. **Update UI callers.** Change related hooks and components, and verify that refreshed results appear after updates.

When adding an operation or domain, also check shared router aggregation and handler registration in `trpc/context.ts`. The [tag list walkthrough](../getting-started/codebase.md) is a useful starting point.

## Where to check permissions

`protectedProcedure` checks login status, but does not by itself guarantee ownership of a video or tag. Follow the existing implementation: pass the user ID to services and repositories and restrict query scope.

Test valid and invalid inputs, unauthenticated access, another user's data, and nonexistent IDs. See [authentication and access control](../concepts/auth.md).

## When to use Hono routes

Authentication, MCP, Stripe webhooks, video binaries, multipart uploads, chat SSE, and CSV exports use formats other than regular JSON calls. These are assembled in `features/*/routes.ts` and `app.ts`.

For ordinary list, fetch, or update operations, check the existing tRPC routers first.

## Verify

```bash
npm run typecheck
npm run test:api
```

`typecheck` also detects contract mismatches in the frontend. API tests include Node.js unit tests and Workers runtime tests. DB integration tests require a separate test database. See [tests and verification commands](testing.md) for prerequisites.

**Related:** [tRPC API design](../architecture/trpc-api.md), [Change the database](database.md).
