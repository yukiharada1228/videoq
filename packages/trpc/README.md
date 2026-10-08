# @videoq/trpc

The tRPC contract shared by the Hono API and React SPA. Regular JSON API calls go
through this package; Hono handles HTTP transport boundaries such as authentication,
webhooks, SSE, multipart requests, and binary responses.

- `src/init.ts`: tRPC initialization, authentication and authorization middleware, and the shared error shape
- `src/inputs/`: Zod input validation by feature (the source of input types)
- `src/outputs.ts`: Output schemas for all procedures (the source of output types)
- `src/model-schemas.ts`: Output validation schemas for shared DTOs
- `src/routers/`: Input/output schemas, authentication, authorization, and query/mutation wiring
- `src/router.ts`: The app router that combines feature routers
- `src/contracts.ts`: Procedure input/output contracts implemented by API adapters
- `src/models.ts`: Shared API/SPA DTO types derived from output schemas
- `src/context.ts`: Request context injected by the Hono adapter
- `src/schema.ts`: Runtime constants also used by the UI

The router is initialized once within this workspace. API implementations are
separated into `ctx.call()` adapters. The SPA imports `AppRouter` as a type only,
so server implementations are not included in its bundle.

`RpcInputMap` is derived from the input schemas' `z.output`, so handlers receive
values after defaults and transforms have been applied. Input structures are not
redefined in separate interfaces.

`RpcOutputMap` and shared DTOs are also derived from output schemas. Every
procedure's `.output()` validates return values and strips fields not defined in the schema.
Output validation failures return `INTERNAL_SERVER_ERROR` with a fixed message;
they are not exposed to clients as input validation error details.

Tag creation, updates, and replacement validate palette names through the shared
`tagColorSchema`. Output colors remain `string` to support stored legacy hex values.
`npm run typecheck` also runs input type and handler output type regression checks
in `type-tests/`.

Regular React JSON queries and mutations use `@trpc/tanstack-react-query`'s
`trpc.*.queryOptions()` / `mutationOptions()` with TanStack Query hooks.
The Vite SPA shares a client and QueryClient, with `QueryClientProvider` as its
only provider. Use `pathFilter()` to refresh a whole list, covering both regular
and infinite queries. `apps/web/src/lib/api.ts` contains transport adapters for
operations outside tRPC, such as Better Auth, SSE, CSV, multipart/direct uploads,
and media URLs.
