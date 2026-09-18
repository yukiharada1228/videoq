---
title: Authentication and access control
description: Understand browser cookie sessions, shared courses, and permissions for MCP integrations.
---

# Authentication and access control

**Authentication** checks who is acting; **authorization** checks whether that person may access the data. Being able to log in does not mean being able to read another person's videos.

## Authentication depends on the entry point

| Entry point | Mechanism | Main use |
|---|---|---|
| Browser | Better Auth cookie session | Login, profile, regular tRPC API |
| MCP client | API key or OAuth | Working with videos and courses from external tools |
| Public share link | Share token, course sharing status, and related checks | Accessing a shared course |

MCP is a protocol that lets external clients, such as AI assistants, call tools. Its endpoint is `/api/mcp`.

## Browser login

1. The login screen sends credentials to Better Auth at `/api/auth/*`.
2. Successful authentication sets a session cookie.
3. Subsequent API calls send that cookie so the API can identify the user.

React uses `useSession` to check login status and `account.me` to fetch the profile. Regular browser APIs do not need custom access-token refresh logic.

## tRPC checks

| Procedure | Entry-point check |
|---|---|
| `publicProcedure` | Does not universally require login; each operation performs checks such as share-token validation |
| `protectedProcedure` | Browser login session |
| `adminProcedure` | Administrator privileges |

Services and database queries then check ownership and course access scope. For API changes, verify that operations succeed for the user's own data and fail for another user's data without permission.

Definitions are in [packages/trpc/src/init.ts](https://github.com/yukiharada1228/videoq/blob/main/packages/trpc/src/init.ts); request integration is in [trpc/context.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/trpc/context.ts).

## MCP checks

API keys are managed in settings. With OAuth, users authorize client access within scopes such as `videoq.read` / `videoq.write`. Do not treat browser sessions and MCP tokens as interchangeable.

## Understanding configuration names

- `BETTER_AUTH_SECRET`: Better Auth's secret, used when running on the host and in production.
- `AUTH_JWT_SECRET`: A compatibility setting forwarded by the Compose startup script. Its name does not describe the current browser authentication mechanism.
- `USER_SECRET_ENCRYPTION_KEY`: Encrypts and decrypts external API keys saved by users. Its purpose differs from the session secret.

**Read next:** [Change the API](../guides/api.md). See [sequence diagrams](../design/sequence-diagram.md) for the request order.
