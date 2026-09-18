# tRPC API design

This reference explains how ordinary data fetching and updates share types between the frontend and API.
If this is your first API change, start with [Change the API](../guides/api.md).

A **procedure** is one operation such as `videos.get`; a **contract** is its input/output agreement.
This page explains where contracts live and how they connect to Hono's implementation.

## Approach

VideoQ standardizes regular JSON APIs on tRPC. React and Hono share `AppRouter`,
with procedure names, input validation, and input/output types managed as one contract.
No OpenAPI schema or API reference UI is generated.

```mermaid
flowchart LR
    React[React frontend] --> Client[tRPC client]
    Client --> Endpoint["/api/trpc"]
    Endpoint --> Hono[Shared Hono middleware]
    Hono --> Router[Shared AppRouter]
    Router --> Adapter[Per-request handlers]
    Adapter --> Service[Feature service]
    Service --> Repository[Database reads and writes]
```

## Workspace boundaries

```text
packages/trpc/
├── src/init.ts          tRPC setup, auth/permission middleware, error formatter
├── src/inputs/          Zod inputs: source of validation and handler input types
├── src/outputs.ts       Zod outputs: source of validation and handler output types
├── src/model-schemas.ts Output validation schemas for shared DTOs
├── src/routers/         Domain routers and procedure wiring
├── src/router.ts        AppRouter composition
├── src/contracts.ts     Zod-derived input/output maps and handler contracts
├── src/models.ts        API / SPA DTOs derived from output schemas
├── src/context.ts       Framework-independent request context
└── src/schema.ts        Shared runtime constants

apps/api/src/trpc/
├── context.ts           Builds auth and handlers from a Hono request
└── handlers/            Connects services to procedure contracts

apps/web/src/lib/
├── trpc.ts              Batch client, TanStack Query options, per-procedure 401 detection
├── api-error.ts         Shared raw HTTP / tRPC error reading
└── api.ts               Better Auth, SSE, CSV, upload, and media URL adapters
```

`packages/trpc` does not depend on Hono, the database, or Cloudflare bindings.
The API implementation is injected as a `ctx.call()` adapter, and Web imports `AppRouter` as a type only.

Define input schemas once in `src/inputs/`. A procedure's `.input()` and `RpcInputMap`
reference the same schema. Handlers receive `z.output` types after defaults and transforms
have been applied. SPA caller types are still inferred from `AppRouter`.

Define every procedure's output schema in `src/outputs.ts`. `.output()` and `RpcOutputMap`
use the same schemas, and shared DTOs are derived from `src/model-schemas.ts` and `src/schema.ts`.
Output validation checks required fields and types, and strips undeclared fields.
Tag writes are restricted to palette names by `tagColorSchema`, while outputs also accept
legacy stored hex colors.

## React and caching

Use `createTRPCOptionsProxy` from `@trpc/tanstack-react-query` with TanStack Query hooks,
for example `useQuery(trpc.videos.get.queryOptions({ id }))`.
The Vite SPA shares its client and QueryClient, with the cache provided by `QueryClientProvider`.

Use `useQueryClient()` for cache operations. Use `queryKey()` / `queryFilter()` for individual
queries and `pathFilter()` for whole lists, updating both regular and infinite queries.
Infinite scrolling uses `infiniteQueryOptions()` with `initialCursor: 0`.

## Authentication and authorization

- `publicProcedure`: Public information, or operations whose handler validates a share token.
- `protectedProcedure`: Requires a Better Auth browser session.
- `adminProcedure`: Lazily verifies superuser status.

Integration API keys and OAuth Bearer tokens are for MCP transport only. They do not authenticate
regular tRPC, SSE, CSV, multipart upload, or media routes.

## Endpoints that stay in Hono

Use raw routes only when the HTTP protocol or payload transport itself matters:

- Better Auth and OAuth / OIDC discovery
- Stripe webhooks
- MCP Streamable HTTP
- Health / readiness
- Media binaries
- Multipart video uploads
- Chat SSE
- Chat history CSV export

For a new regular JSON operation, define its input schema in `packages/trpc/src/inputs`
and output schema in `packages/trpc/src/outputs.ts`. Wire `.input()` / `.output()` in
`packages/trpc/src/routers` and add its implementation in `apps/api/src/trpc/handlers`.

## Error contract

In addition to standard tRPC error codes and HTTP statuses, error data preserves
`applicationCode` for existing UI decisions and `details` for field validation.
Internal error messages are replaced with fixed text before being exposed.
Output validation failures use `INTERNAL_SERVER_ERROR`, distinct from input `VALIDATION_ERROR`.
Output validation errors do not include `applicationCode` or validation `details`.

The SPA receives standard `TRPCClientError` objects directly. Use `getApiError()` when a screen
needs the application code or details. The link detects expired authentication per procedure,
including mixed batches with HTTP 207. Logout is signaled only once per HTTP response.

tRPC's adapter `onError` logs the request ID, procedure, error code, safe error attributes,
and stack frames for internal exceptions. It does not log inputs, cookies, query strings,
SQL parameters in error messages, or personal data.
