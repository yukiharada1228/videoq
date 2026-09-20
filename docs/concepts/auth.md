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

Session reads use the database, without a cookie cache. Inactive users cannot create new sessions; inactive or banned users cannot use existing sessions at Better Auth endpoints, including its administrator and API-key APIs. Signing out remains available.

## Implementation boundary

Prefer Better Auth's documented options, plugins and server/client APIs. It owns password hashing, session cookies, email verification, Google token verification, OAuth protocol validation and provider-token encryption. Use its inferred API types. Session lookup failures caused by an outage must not be treated as logout; server-side authentication refusals must be translated into the application's normal unauthorized response.

The implementation follows this boundary:

| Requirement | Better Auth implementation |
|---|---|
| Password and username login, Google login, email verification/change, recovery, cookies | Core options, Google provider and the `username` plugin |
| Administrator roles and account banning | `admin` plugin |
| API key creation, storage, verification and revocation | `@better-auth/api-key` |
| OAuth/OIDC, PKCE, refresh rotation and replay detection | `@better-auth/oauth-provider` and `jwt` |
| VideoQ account status, immediate consent revocation and reset-link invalidation | `videoq-auth-security` companion plugin |
| MCP access using a verified API key or OAuth token | `videoq-resource-access` server-only plugin APIs |

The companion plugins add only application policy that the installed standard plugins do not supply:

- Current account status and consent are checked at the token endpoint before issuance. The official `extensions` option supplies the consent claim and UserInfo policy; token-claim callbacks do not repeat issuance checks. Refresh-token reuse retains Better Auth's default rejection and family revocation.
- A before hook extends the standard consent-deletion endpoint to remove token records atomically with consent. It uses Better Auth's session middleware and adapter transaction; the official provider object is not modified. The stored authorization-code binding prevents old codes from becoming valid after reconnection.
- Resource verification is available only through `auth.api.verifyVideoqApiKey` and `auth.api.verifyVideoqOAuth`. Both use the standard credential verifiers and add VideoQ account/access policy. Issuance, UserInfo, introspection and MCP share the same consent check. Hono only selects the credential mechanism and maps the result to application permissions and HTTP responses.
- The standard request verifier currently requires a remote JWKS URL. Because a Cloudflare Worker cannot fetch its own same-zone Route, the resource plugin composes Better Auth's public JWT and DPoP helpers with the JWT plugin's in-process JWKS endpoint. DPoP replay prevention uses Better Auth's standard database-backed `createDpopReplayStore`, shared across Worker instances.
- Recovery and completed email/password changes invalidate that user's other reset links. The `verification.storeIdentifier` hash callback retains a reset-specific namespace so these deletions preserve unrelated verification values and existing links remain usable.

Better Auth's configured logger excludes provider responses, token-bearing URLs and SQL details from library logs.

Keep the real-route regression tests when upgrading Better Auth. Remove a workaround when a supported library feature provides the same behavior; add independent auth logic only for a demonstrated gap or an explicit VideoQ requirement.

## tRPC checks

| Procedure | Entry-point check |
|---|---|
| `publicProcedure` | Does not universally require login; each operation performs checks such as share-token validation |
| `protectedProcedure` | Browser login session |
| `adminProcedure` | Administrator privileges |

Services and database queries then check ownership and course access scope. For API changes, verify that operations succeed for the user's own data and fail for another user's data without permission.

Definitions are in [packages/trpc/src/init.ts](https://github.com/yukiharada1228/videoq/blob/main/packages/trpc/src/init.ts); request integration is in [trpc/context.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/trpc/context.ts).

## Course sharing and invitations

For the owner/participant/share-link permission table, AI answer allowance, history visibility, and revocation steps, see [Sharing, invitations, and chat history](course-sharing.md).

## MCP checks

API keys are managed in settings. With OAuth, users authorize client access within scopes such as `videoq.read` / `videoq.write`. Do not treat browser sessions and MCP tokens as interchangeable.

Disconnecting an OAuth app atomically deletes that user's consent and access/refresh-token records for the selected client. Each authorization code and refresh-token chain carries the original consent ID in `referenceId`; issued JWTs carry it in `videoq_grant`. MCP checks that exact consent, its owner, client and scopes in the database on every request. Reconnecting creates a new consent, so old tokens and authorization codes remain invalid.

The supported OAuth grants are authorization-code exchange and refresh. Both check the original consent and current user status before issuance, including requests without `resource` that produce opaque access tokens. UserInfo (GET and POST) applies the same checks; authenticated token introspection reports revoked or suspended-user credentials as `active: false`. Normal OAuth/OIDC flows without `resource` remain supported.

When deploying consent-bound tokens for the first time, existing OAuth clients must authorize again: tokens without this binding are rejected. No database migration is required. Browser sessions and API keys continue using their existing formats.

## Understanding configuration names

- `BETTER_AUTH_SECRET`: Better Auth's secret, used when running on the host and in production.
- `AUTH_JWT_SECRET`: A compatibility setting forwarded by the Compose startup script. Its name does not describe the current browser authentication mechanism.
- `USER_SECRET_ENCRYPTION_KEY`: Encrypts and decrypts external API keys saved by users. Its purpose differs from the session secret.

**Read next:** [Change the API](../guides/api.md). See [sequence diagrams](../design/sequence-diagram.md) for the request order.
