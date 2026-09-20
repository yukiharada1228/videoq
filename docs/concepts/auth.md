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

Session reads use the database, without a cookie cache. Better Auth's Admin plugin owns `banned`, temporary-ban expiry, and session revocation. Banned users cannot create sessions or use surviving sessions at Better Auth endpoints. Signing out remains available. Administrator privileges come only from the native `role`; historical `is_active` and `is_superuser` columns are not authorization inputs.

## Implementation boundary

Prefer Better Auth's documented options, plugins and server/client APIs. It owns password hashing, session cookies, email verification, Google token verification, OAuth protocol validation and provider-token encryption. Use its inferred API types. Session lookup failures caused by an outage must not be treated as logout; server-side authentication refusals must be translated into the application's normal unauthorized response.

The implementation follows this boundary:

| Requirement | Better Auth implementation |
|---|---|
| Password and username login, Google login, email verification/change, recovery, cookies | Core options, Google provider and the `username` plugin |
| Administrator roles and account banning | `admin` plugin's `setRole`, `banUser`, `unbanUser` and `adminUpdateUser` APIs |
| API key creation, storage, permissions, verification and revocation | `@better-auth/api-key` configurations and `permissions`; native `verifyApiKey` and access-control helper |
| OAuth/OIDC, PKCE, refresh rotation and replay detection | `@better-auth/oauth-provider` and `jwt` |
| MCP resource discovery and Bearer/DPoP challenges | Official OAuth Resource Client and `createResourceServerChallenge` |
| VideoQ account status and stopping renewal after disconnect | `videoq-auth-security` companion plugin |
| MCP access using a verified API key or OAuth token | `videoq-resource-access` server-only plugin APIs |

The companion plugins add only application policy that the installed standard plugins do not supply:

- Current account status and consent scopes are checked before issuance. The documented `customTokenResponseFields` callback receives the provider-validated authorization request after PKCE validation and before token persistence. A before hook checks current consent for refresh credentials, using the provider's hashing helper. No stored authorization-code JSON is parsed or rewritten. Refresh reuse retains Better Auth's default rejection and family revocation. Access tokens have a five-minute lifetime and no private consent claim.
- The Admin plugin owns banning and browser-session revocation. API keys, OAuth issuance/resource access, UserInfo and introspection additionally check the native ban state because standard token verifiers do not consistently check the owner's ban. Banning does not delete the user's consent or offline integrations; after unbanning, still-valid API keys and offline refresh tokens can work again. Disconnecting an app is the operation that deletes its credentials.
- A before hook extends the standard consent-deletion endpoint to remove token records atomically with consent. It uses Better Auth's session middleware and adapter transaction; the official provider object is not modified. Subsequent issuance requires current consent, including when an in-flight refresh persists after the deletion.
- Resource verification is available only through `auth.api.verifyVideoqApiKey` and `auth.api.verifyVideoqOAuth`. Both use the standard credential verifiers and add VideoQ account/access policy. MCP uses the signed scopes and native JWT expiry without querying consent or client records on each request. Hono only selects the credential mechanism and maps the result to application permissions and HTTP responses.
- The standard request verifier currently requires a remote JWKS URL. Because a Cloudflare Worker cannot fetch its own same-zone Route, the resource plugin composes Better Auth's public JWT and DPoP helpers with the JWT plugin's in-process JWKS endpoint. DPoP replay prevention uses Better Auth's standard database-backed `createDpopReplayStore`, shared across Worker instances.

Password reset uses core `verification.storeIdentifier` with a `reset-password:` override of `"hashed"`, a 15-minute lifetime and `revokeSessionsOnPasswordReset: true`. Better Auth atomically consumes each link once. There is no custom digest or bulk reset-link invalidation. Separately issued links remain valid until their own expiry or use, including after a password or email change; the new shorter expiry bounds this standard behavior. A reset callback only clears the application's legacy `passwordResetRequired` bookkeeping field.

Better Auth's configured logger excludes provider responses, token-bearing URLs and SQL details from library logs.

Keep the real-route regression tests when upgrading Better Auth. Remove a workaround when a supported library feature provides the same behavior; add independent auth logic only for a demonstrated gap or an explicit VideoQ requirement.

### Decisions after reviewing the requirements

| Requirement | Decision and reason |
|---|---|
| Immediately revoke every issued JWT after disconnect or consent changes | Remove. Follow the official provider's short-lived JWT model, with a five-minute lifetime. |
| Stop renewal while an app is disconnected | Keep current-consent checks and token deletion. Otherwise removing consent alone leaves renewal working. |
| Keep every authorization generation isolated after explicit reconnection | Remove. Check the user's current consent and scopes; the provider owns code expiry, single use, PKCE and rotation. |
| Reject banned accounts | Keep the owner check. Native API-key/JWT verification alone does not apply the Admin ban. |
| Delete every OAuth integration when an account is banned | Remove. Use native session revocation and deny access while banned; explicit app disconnection owns token deletion. |
| Invalidate every other reset link after recovery or email/password changes | Remove. Use native hashed storage, 15-minute expiry, atomic single use and session revocation. |
| Fetch JWKS within the Worker | Keep the small adapter while the official verifier requires HTTP JWKS fetching. |

The remaining policy uses documented hooks, callbacks and adapter operations. It no longer injects a consent ID into codes or refresh tokens and does not reject otherwise valid credentials because they lack a private generation marker. After the user explicitly reconnects the same client, a still-valid pending authorization code can complete within the newly granted scopes. Deleted refresh tokens remain deleted; a token that survived a concurrent rotation is checked against current consent on its next use. An attempted exchange while disconnected is rejected, and the native provider consumes that code so it cannot be retried after reconnection.

The official [API Key](https://better-auth.com/docs/plugins/api-key) plugin supplies two configurations: `default` grants `videoq: [read]`, and `read-write` grants `videoq: [read, write]`. The browser selects a configuration, while only the server sets permissions. Legacy `metadata.accessLevel` / `access_level` no longer determine access. Listing and deletion retain each key's configuration ID, including migrated write-capable keys in the `default` configuration.

The official [MCP](https://better-auth.com/docs/plugins/mcp) plugin was also reviewed. Its request verifier uses an HTTP JWKS URL, so it does not replace the in-process Workers adapter in the installed version. Resource metadata uses the official Resource Client without DB access and advertises only `videoq.read` / `videoq.write`; OIDC and refresh scopes remain advertised by the authorization server.

### Migrating existing installations

Before deploying the native permission/account-state implementation, apply `0021_better_auth_permissions_and_account_state.sql` through the normal Drizzle migration command. Pause legacy authentication/admin writes for the migration and deployment so the old application cannot create metadata-only keys or change legacy flags after backfill. The migration copies the previously enforced API-key access levels into `permissions`, inactive accounts into `banned`, and legacy administrator flags into `role`. Existing key hashes remain unchanged; no key reissue is needed. Historical columns remain for legacy import tooling, but runtime authorization does not read them.

Also apply `0022_standard_password_reset_identifiers.sql` before deploying native reset-token hashing. It converts the previous prefixed hex SHA-256 identifiers into Better Auth's base64url SHA-256 encoding, preserving outstanding reset links and their original expiry. Unrelated verification records and plaintext legacy links are unchanged. Pause authentication writes through migration and deployment so old code cannot create identifiers in the retired format afterwards. Newly requested links expire after 15 minutes; previously issued links retain their original lifetime.

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

The initial MCP authentication challenge points to resource metadata without overriding its scopes, so clients can request both read and write access. A read-only OAuth token remains usable for read tools. Calling a write tool returns HTTP 403 with Better Auth's `insufficient_scope` challenge naming both required scopes, allowing the client to request consent again. Existing tokens never gain permissions automatically. If a client was registered with only `videoq.read`, remove and re-add the connection in that client so it can register for both scopes.

Disconnecting an OAuth app atomically deletes that user's consent and access/refresh-token records for the selected client. New issuance requires current consent and matching scopes. The application does not maintain separate authorization generations across reconnection.

An already-issued JWT remains usable until its expiry, at most five minutes for newly issued tokens. Disconnecting, changing consent scopes or disabling a client does not immediately revoke its JWT at MCP. Banned or deleted owners are rejected immediately. Unbanning allows still-valid integrations to resume; revoked browser sessions remain invalid. API-key revocation and deletion of stored opaque access tokens remain immediate.

The supported OAuth grants are authorization-code exchange and refresh, including normal OAuth/OIDC requests without `resource`. UserInfo and authenticated introspection retain the provider's token/session validation plus the owner ban check: deleted opaque/refresh tokens are inactive, while JWTs normally remain active until expiry. This follows the official [OAuth Provider revocation model](https://better-auth.com/docs/plugins/oauth-provider#revoke-endpoint).

Removing generation binding does not require OAuth reauthorization or a database migration: existing `referenceId` values are ignored by application policy. Previously issued JWTs retain their original expiry (up to 15 minutes under the preceding resource configuration); the five-minute limit applies at issuance. Browser sessions and API keys keep their formats. The separate native permissions/account-state and reset-identifier migrations described above are still required where they have not been applied.

## Understanding configuration names

- `BETTER_AUTH_SECRET`: Better Auth's secret, used when running on the host and in production.
- `AUTH_JWT_SECRET`: A compatibility setting forwarded by the Compose startup script. Its name does not describe the current browser authentication mechanism.
- `USER_SECRET_ENCRYPTION_KEY`: Encrypts and decrypts external API keys saved by users. Its purpose differs from the session secret.

**Read next:** [Change the API](../guides/api.md). See [sequence diagrams](../design/sequence-diagram.md) for the request order.
