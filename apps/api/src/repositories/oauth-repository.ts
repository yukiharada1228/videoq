import {
  and,
  desc,
  eq,
  gt,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { withDb } from "../db/pool";
import {
  users,
  oauthAccessTokens,
  oauthApplications,
  oauthDeviceGrants,
  oauthGrants,
  oauthIdTokens,
  oauthRefreshTokens,
} from "../db/schema";
import type { Bindings } from "../types/bindings";
import { toUtcIso } from "../shared/datetime";
import {
  ACCESS_TOKEN_EXPIRE_SECONDS,
  AUTHORIZATION_CODE_EXPIRE_SECONDS,
  DCR_REGISTRATION_SCOPE,
  DCR_REGISTRATION_TOKEN_EXPIRES,
  DEVICE_CODE_EXPIRE_SECONDS,
  DEVICE_FLOW_INTERVAL,
  generateAccessTokenValue,
  generateAuthorizationCode,
  generateClientId,
  generateClientSecret,
  generateDeviceUserCode,
  generateOpaqueToken,
  tokenChecksum,
} from "../lib/oauth";
import { hashPassword, verifyPassword } from "../lib/password";

/** Settings UI 用の認可済みトークン一覧 1 件。 */
export type AuthorizedTokenItem = {
  id: number;
  client_id: string;
  client_name: string;
  scope: string;
  issued_at: string;
  expires_at: string | null;
};

export type OAuthApplication = {
  id: number;
  client_id: string;
  client_secret: string;
  client_type: "public" | "confidential";
  authorization_grant_type: string;
  name: string;
  redirect_uris: string;
  post_logout_redirect_uris: string;
  /** OIDC ID token signing algorithm: "" | "RS256" | "HS256" */
  algorithm: string;
  skip_authorization: boolean;
  user_id: number | null;
  registration_source: string;
  hash_client_secret: boolean;
};

export type OAuthGrant = {
  id: number;
  user_id: number;
  code: string;
  application_id: number;
  expires: Date;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string[];
  nonce: string;
};


const applicationFields = {
  id: oauthApplications.id,
  client_id: oauthApplications.clientId,
  client_secret: oauthApplications.clientSecret,
  client_type: oauthApplications.clientType,
  authorization_grant_type: oauthApplications.authorizationGrantType,
  name: oauthApplications.name,
  redirect_uris: oauthApplications.redirectUris,
  post_logout_redirect_uris: oauthApplications.postLogoutRedirectUris,
  algorithm: oauthApplications.algorithm,
  skip_authorization: oauthApplications.skipAuthorization,
  user_id: oauthApplications.userId,
  hash_client_secret: oauthApplications.hashClientSecret,
};

type ApplicationRow = {
  id: number;
  client_id: string;
  client_secret: string;
  client_type: string;
  authorization_grant_type: string;
  name: string;
  redirect_uris: string;
  post_logout_redirect_uris: string;
  algorithm: string;
  skip_authorization: boolean;
  user_id: number | null;
  registration_source: string;
  hash_client_secret: boolean;
};

function mapApplication(r: ApplicationRow | Record<string, unknown>): OAuthApplication {
  return {
    id: Number(r.id),
    client_id: r.client_id as string,
    client_secret: (r.client_secret as string) ?? "",
    client_type: r.client_type as "public" | "confidential",
    authorization_grant_type: r.authorization_grant_type as string,
    name: (r.name as string) ?? "",
    redirect_uris: (r.redirect_uris as string) ?? "",
    post_logout_redirect_uris: (r.post_logout_redirect_uris as string) ?? "",
    algorithm: (r.algorithm as string) ?? "",
    skip_authorization: Boolean(r.skip_authorization),
    user_id: r.user_id == null ? null : Number(r.user_id),
    registration_source:
      (r.registration_source as string | undefined) ??
      (r.user_id == null ? "dcr" : "manual"),
    hash_client_secret: r.hash_client_secret !== false,
  };
}

function parseResourceJson(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * ユーザーが認可した未期限切れ AccessToken。
 * created/expires は UTC ISO 8601 で返す。
 */
export async function listAuthorizedTokens(
  env: Bindings,
  userId: number,
): Promise<AuthorizedTokenItem[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: oauthAccessTokens.id,
        scope: oauthAccessTokens.scope,
        client_id: sql<string>`coalesce(${oauthApplications.clientId}, '')`.as("client_id"),
        client_name: sql<string>`coalesce(${oauthApplications.name}, '')`.as("client_name"),
        issued_at: oauthAccessTokens.created,
        expires_at: oauthAccessTokens.expires,
      })
      .from(oauthAccessTokens)
      .leftJoin(
        oauthApplications,
        eq(oauthApplications.id, oauthAccessTokens.applicationId),
      )
      .where(
        and(
          eq(oauthAccessTokens.userId, userId),
          gt(oauthAccessTokens.expires, sql`now()`),
        ),
      )
      .orderBy(desc(oauthAccessTokens.created));

    return rows.map((r) => ({
      id: Number(r.id),
      client_id: r.client_id,
      client_name: r.client_name,
      scope: r.scope ?? "",
      issued_at: toUtcIso(r.issued_at)!,
      expires_at: toUtcIso(r.expires_at),
    }));
  });
}

/** 所有者のトークンを削除（`revoke_for_user`）。成功=true。 */
export async function revokeAuthorizedToken(
  env: Bindings,
  userId: number,
  tokenId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .delete(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.id, tokenId),
          eq(oauthAccessTokens.userId, userId),
        ),
      )
      .returning({ id: oauthAccessTokens.id });
    return rows.length > 0;
  });
}

/**
 * Bearer OAuth トークンを `token_checksum`（sha256 hex）で解決。
 * 期限切れ・user 無しは null。
 * ※ 現行共有 DB に RFC 8707 `resource` 列が無い環境があるため、audience 検証は行わない
 *   （列が追加されたら `resource` JSON と OAUTH2_PROTECTED_RESOURCE_IDENTIFIER を突合する）。
 */
export async function resolveOAuthAccessToken(
  env: Bindings,
  tokenChecksumHex: string,
): Promise<{ userId: number; scope: string } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        userId: oauthAccessTokens.userId,
        scope: oauthAccessTokens.scope,
      })
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.tokenChecksum, tokenChecksumHex),
          gt(oauthAccessTokens.expires, sql`now()`),
          isNotNull(oauthAccessTokens.userId),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    return {
      userId: Number(rows[0].userId),
      scope: rows[0].scope ?? "",
    };
  });
}

export async function findApplicationByClientId(
  env: Bindings,
  clientId: string,
): Promise<OAuthApplication | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select(applicationFields)
      .from(oauthApplications)
      .where(eq(oauthApplications.clientId, clientId))
      .limit(1);
    if (rows.length === 0) return null;
    return mapApplication(rows[0]);
  });
}

export function redirectUriAllowed(app: OAuthApplication, uri: string): boolean {
  const allowed = app.redirect_uris.split(/\s+/).filter(Boolean);
  return allowed.includes(uri);
}

export function postLogoutRedirectUriAllowed(
  app: OAuthApplication,
  uri: string,
): boolean {
  const allowed = app.post_logout_redirect_uris.split(/\s+/).filter(Boolean);
  return allowed.includes(uri);
}

export async function verifyClientSecret(
  app: OAuthApplication,
  plaintext: string,
): Promise<boolean> {
  if (!plaintext) return false;
  if (!app.client_secret) return false;
  if (!app.hash_client_secret) return false;
  return verifyPassword(plaintext, app.client_secret);
}

export type CreateDcrApplicationInput = {
  name: string;
  redirectUris: string[];
  clientType: "public" | "confidential";
  authorizationGrantType: string;
};

export type CreateDcrApplicationResult = {
  application: OAuthApplication;
  clientSecretPlain: string | null;
  registrationAccessToken: string;
};

/** RFC 7591 DCR: Application + registration AccessToken を原子作成。 */
export async function createDcrApplication(
  env: Bindings,
  input: CreateDcrApplicationInput,
): Promise<CreateDcrApplicationResult> {
  const clientId = generateClientId();
  const rawSecret = generateClientSecret();
  const hashedSecret = await hashPassword(rawSecret);
  const redirectUris = input.redirectUris.join(" ");

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const appResult = await db.execute(sql`
        INSERT INTO oauth_applications
           (client_id, user_id, redirect_uris, post_logout_redirect_uris,
            client_type, authorization_grant_type, client_secret, hash_client_secret,
            name, skip_authorization, created, updated, algorithm, allowed_origins)
         VALUES
           (${clientId}, NULL, ${redirectUris}, '', ${input.clientType}, ${input.authorizationGrantType},
            ${hashedSecret}, TRUE, ${input.name}, FALSE, now(), now(), '', '')
         RETURNING id, client_id, client_secret, client_type, authorization_grant_type,
                   name, redirect_uris, post_logout_redirect_uris, algorithm,
                   skip_authorization, user_id, hash_client_secret
      `);
      const application = mapApplication(
        appResult.rows[0] as Record<string, unknown>,
      );

      const regToken = generateClientSecret();
      const checksum = await tokenChecksum(regToken);
      await db.execute(sql`
        INSERT INTO oauth_access_tokens
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, created, updated)
         VALUES
           (NULL, NULL, ${regToken}, ${checksum}, NULL, ${application.id},
            ${DCR_REGISTRATION_TOKEN_EXPIRES.toISOString()}, ${DCR_REGISTRATION_SCOPE},
            now(), now())
      `);

      await client.query("COMMIT");
      return {
        application,
        clientSecretPlain:
          input.clientType === "confidential" ? rawSecret : null,
        registrationAccessToken: regToken,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * DCR クライアントのメタデータ更新（RFC 7592 PUT）+ 登録トークン rotation。
 * DCR 更新時に新しい registration token を発行し、旧トークンを削除する。
 * 返り値は新しい registration access token（平文）。
 */
export async function updateDcrApplication(
  env: Bindings,
  appId: number,
  fields: {
    name: string;
    redirectUris: string[];
    clientType: "public" | "confidential";
    authorizationGrantType: string;
  },
  oldRegistrationTokenRaw: string,
): Promise<string> {
  const redirectUris = fields.redirectUris.join(" ");
  const newRegToken = generateClientSecret();
  const newChecksum = await tokenChecksum(newRegToken);
  const oldChecksum = await tokenChecksum(oldRegistrationTokenRaw);

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await db
        .update(oauthApplications)
        .set({
          redirectUris,
          clientType: fields.clientType,
          authorizationGrantType: fields.authorizationGrantType,
          name: fields.name,
          updated: sql`now()`,
        })
        .where(eq(oauthApplications.id, appId));

      await db.execute(sql`
        INSERT INTO oauth_access_tokens
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, created, updated)
         VALUES
           (NULL, NULL, ${newRegToken}, ${newChecksum}, NULL, ${appId},
            ${DCR_REGISTRATION_TOKEN_EXPIRES.toISOString()}, ${DCR_REGISTRATION_SCOPE},
            now(), now())
      `);

      await db
        .delete(oauthAccessTokens)
        .where(eq(oauthAccessTokens.tokenChecksum, oldChecksum));

      await client.query("COMMIT");
      return newRegToken;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * DCR クライアント削除（RFC 7592 DELETE）。子の token/grant/
 * idtoken/refreshtoken を tx で先に削除する（FK は deferrable なので順序は柔軟）。
 */
export async function deleteOAuthApplicationCascade(
  env: Bindings,
  appId: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await db
        .delete(oauthGrants)
        .where(eq(oauthGrants.applicationId, appId));
      await db
        .delete(oauthRefreshTokens)
        .where(eq(oauthRefreshTokens.applicationId, appId));
      await db
        .delete(oauthIdTokens)
        .where(eq(oauthIdTokens.applicationId, appId));
      await db
        .delete(oauthAccessTokens)
        .where(eq(oauthAccessTokens.applicationId, appId));
      await db
        .delete(oauthApplications)
        .where(eq(oauthApplications.id, appId));
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export async function resolveRegistrationAccessToken(
  env: Bindings,
  rawToken: string,
  clientId: string,
): Promise<{ application: OAuthApplication; token: string } | null> {
  const checksum = await tokenChecksum(rawToken);
  return withDb(env, async (db) => {
    const result = await db.execute(sql`
      SELECT t.token, t.scope, t.expires, t.application_id,
             a.id, a.client_id, a.client_secret, a.client_type, a.authorization_grant_type,
             a.name, a.redirect_uris, a.post_logout_redirect_uris, a.algorithm,
             a.skip_authorization, a.user_id, a.hash_client_secret
        FROM oauth_access_tokens t
        JOIN oauth_applications a ON a.id = t.application_id
       WHERE t.token_checksum = ${checksum}
         AND t.expires > now()
    `);
    const rows = result.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const r = rows[0];
    const scope = new Set(String(r.scope ?? "").split(/\s+/).filter(Boolean));
    if (!scope.has(DCR_REGISTRATION_SCOPE)) return null;
    if (r.client_id !== clientId) return null;
    if (r.user_id != null) return null;
    return {
      application: mapApplication(r),
      token: r.token as string,
    };
  });
}

export async function createAuthorizationGrant(
  env: Bindings,
  params: {
    userId: number;
    applicationId: number;
    redirectUri: string;
    scope: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    resource: string[];
    nonce?: string;
  },
): Promise<string> {
  const code = generateAuthorizationCode();
  const expireSeconds = String(AUTHORIZATION_CODE_EXPIRE_SECONDS);
  const resourceJson = JSON.stringify(params.resource);

  return withDb(env, async (db) => {
    await db.execute(sql`
      INSERT INTO oauth_grants
         (user_id, code, application_id, expires, redirect_uri, scope,
          created, updated, code_challenge, code_challenge_method, nonce, claims)
       VALUES
         (${params.userId}, ${code}, ${params.applicationId},
          now() + (${expireSeconds}::text || ' seconds')::interval,
          ${params.redirectUri}, ${params.scope}, now(), now(),
          ${params.codeChallenge}, ${params.codeChallengeMethod},
          ${params.nonce ?? ""}, ${resourceJson})
    `);
    return code;
  });
}

export async function findValidGrant(
  env: Bindings,
  code: string,
  applicationId: number,
): Promise<OAuthGrant | null> {
  return withDb(env, async (db) => {
    const result = await db.execute(sql`
      SELECT id, user_id, code, application_id, expires, redirect_uri, scope,
             code_challenge, code_challenge_method, claims, nonce
        FROM oauth_grants
       WHERE code = ${code} AND application_id = ${applicationId} AND expires > now()
    `);
    const rows = result.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      user_id: Number(r.user_id),
      code: r.code as string,
      application_id: Number(r.application_id),
      expires: new Date(r.expires as string),
      redirect_uri: r.redirect_uri as string,
      scope: (r.scope as string) ?? "",
      code_challenge: (r.code_challenge as string) ?? "",
      code_challenge_method: (r.code_challenge_method as string) ?? "",
      resource: parseResourceJson(r.claims),
      nonce: (r.nonce as string) ?? "",
    };
  });
}

export type IssuedTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
};

/** authorization_code → access + refresh（grant 削除込み）。 */
export async function exchangeAuthorizationCode(
  env: Bindings,
  grant: OAuthGrant,
  applicationId: number,
): Promise<IssuedTokenPair> {
  const access = generateAccessTokenValue();
  const refresh = generateAccessTokenValue();
  const accessChecksum = await tokenChecksum(access);
  const tokenFamily = crypto.randomUUID();
  const accessExpireSeconds = String(ACCESS_TOKEN_EXPIRE_SECONDS);

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const at = await db.execute(sql`
        INSERT INTO oauth_access_tokens
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, created, updated)
         VALUES
           (${grant.user_id}, NULL, ${access}, ${accessChecksum}, NULL, ${applicationId},
            now() + (${accessExpireSeconds}::text || ' seconds')::interval,
            ${grant.scope}, now(), now())
         RETURNING id
      `);
      const accessId = Number((at.rows[0] as { id: number }).id);

      await db.execute(sql`
        INSERT INTO oauth_refresh_tokens
           (user_id, token, application_id, access_token_id,
            token_family, created, updated, revoked)
         VALUES
           (${grant.user_id}, ${refresh}, ${applicationId}, ${accessId},
            ${tokenFamily}::uuid, now(), now(), NULL)
      `);

      await db
        .delete(oauthGrants)
        .where(eq(oauthGrants.id, grant.id));

      await client.query("COMMIT");
      return {
        accessToken: access,
        refreshToken: refresh,
        expiresIn: ACCESS_TOKEN_EXPIRE_SECONDS,
        scope: grant.scope,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

type RefreshRow = {
  id: number;
  user_id: number;
  application_id: number;
  access_token_id: number | null;
  token_family: string | null;
  scope: string;
  resource: string[];
  created: Date;
};

export async function findActiveRefreshToken(
  env: Bindings,
  rawRefresh: string,
  applicationId: number,
): Promise<RefreshRow | null> {
  return withDb(env, async (db) => {
    const result = await db.execute(sql`
      SELECT r.id, r.user_id, r.application_id, r.access_token_id, r.token_family,
             r.created, coalesce(a.scope, '') AS scope
        FROM oauth_refresh_tokens r
         LEFT JOIN oauth_access_tokens a ON a.id = r.access_token_id
       WHERE r.token = ${rawRefresh}
         AND r.revoked IS NULL
         AND r.application_id = ${applicationId}
       ORDER BY r.id DESC
       LIMIT 1
    `);
    const rows = result.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      user_id: Number(r.user_id),
      application_id: Number(r.application_id),
      access_token_id: r.access_token_id == null ? null : Number(r.access_token_id),
      token_family: (r.token_family as string | null) ?? null,
      scope: (r.scope as string) || "read",
      resource: [],
      created: new Date(r.created as string),
    };
  });
}

/** refresh_token grant。使用時に refresh token をローテーションする。 */
export async function rotateRefreshToken(
  env: Bindings,
  old: RefreshRow,
): Promise<IssuedTokenPair> {
  const access = generateAccessTokenValue();
  const refresh = generateAccessTokenValue();
  const accessChecksum = await tokenChecksum(access);
  const tokenFamily = old.token_family ?? crypto.randomUUID();
  const accessExpireSeconds = String(ACCESS_TOKEN_EXPIRE_SECONDS);

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      if (old.access_token_id != null) {
        await db
          .delete(oauthAccessTokens)
          .where(eq(oauthAccessTokens.id, old.access_token_id));
      }
      await db
        .update(oauthRefreshTokens)
        .set({
          revoked: sql`now()`,
          accessTokenId: null,
          updated: sql`now()`,
        })
        .where(
          and(
            eq(oauthRefreshTokens.id, old.id),
            isNull(oauthRefreshTokens.revoked),
          ),
        );

      const at = await db.execute(sql`
        INSERT INTO oauth_access_tokens
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, created, updated)
         VALUES
           (${old.user_id}, ${old.id}, ${access}, ${accessChecksum}, NULL, ${old.application_id},
            now() + (${accessExpireSeconds}::text || ' seconds')::interval,
            ${old.scope}, now(), now())
         RETURNING id
      `);
      const accessId = Number((at.rows[0] as { id: number }).id);

      await db.execute(sql`
        INSERT INTO oauth_refresh_tokens
           (user_id, token, application_id, access_token_id,
            token_family, created, updated, revoked)
         VALUES
           (${old.user_id}, ${refresh}, ${old.application_id}, ${accessId},
            ${tokenFamily}::uuid, now(), now(), NULL)
      `);

      await client.query("COMMIT");
      return {
        accessToken: access,
        refreshToken: refresh,
        expiresIn: ACCESS_TOKEN_EXPIRE_SECONDS,
        scope: old.scope,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/** RFC 7009 revoke（access または refresh）。常に成功扱いで呼ぶ側が 200。 */
export async function revokeOAuthToken(
  env: Bindings,
  rawToken: string,
  hint: string | null,
  applicationId: number,
): Promise<void> {
  const checksum = await tokenChecksum(rawToken);
  await withDb(env, async (db) => {
    const tryAccess = async () => {
      await db
        .delete(oauthAccessTokens)
        .where(
          and(
            eq(oauthAccessTokens.tokenChecksum, checksum),
            eq(oauthAccessTokens.applicationId, applicationId),
          ),
        );
    };
    const tryRefresh = async () => {
      const rows = await db
        .select({
          id: oauthRefreshTokens.id,
          accessTokenId: oauthRefreshTokens.accessTokenId,
        })
        .from(oauthRefreshTokens)
        .where(
          and(
            eq(oauthRefreshTokens.token, rawToken),
            eq(oauthRefreshTokens.applicationId, applicationId),
            isNull(oauthRefreshTokens.revoked),
          ),
        );
      for (const r of rows) {
        if (r.accessTokenId != null) {
          await db
            .delete(oauthAccessTokens)
            .where(eq(oauthAccessTokens.id, r.accessTokenId));
        }
        await db
          .update(oauthRefreshTokens)
          .set({
            revoked: sql`now()`,
            accessTokenId: null,
            updated: sql`now()`,
          })
          .where(eq(oauthRefreshTokens.id, r.id));
      }
    };

    if (hint === "refresh_token") {
      await tryRefresh();
      await tryAccess();
    } else {
      await tryAccess();
      await tryRefresh();
    }
  });
}

// ─── Introspect / Device / Applications HTML ─────────────────

export type IntrospectionActive = {
  active: true;
  scope: string;
  exp: number;
  client_id: string;
  username: string | null;
};

/** RFC 7662: token_checksum で access token を解決。無効は null。 */
export async function findTokenForIntrospection(
  env: Bindings,
  rawToken: string,
): Promise<IntrospectionActive | null> {
  const checksum = await tokenChecksum(rawToken);
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        scope: oauthAccessTokens.scope,
        exp: sql<number>`extract(epoch from ${oauthAccessTokens.expires})::bigint`.as("exp"),
        client_id: sql<string>`coalesce(${oauthApplications.clientId}, '')`.as("client_id"),
        username: users.username,
      })
      .from(oauthAccessTokens)
      .leftJoin(
        oauthApplications,
        eq(oauthApplications.id, oauthAccessTokens.applicationId),
      )
      .leftJoin(users, eq(users.id, oauthAccessTokens.userId))
      .where(
        and(
          eq(oauthAccessTokens.tokenChecksum, checksum),
          gt(oauthAccessTokens.expires, sql`now()`),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      active: true,
      scope: r.scope ?? "",
      exp: Number(r.exp),
      client_id: r.client_id,
      username: r.username == null ? null : String(r.username),
    };
  });
}

/** Bearer introspect 用: トークンの scope に introspection が含まれるか。 */
export async function bearerHasIntrospectionScope(
  env: Bindings,
  rawToken: string,
): Promise<boolean> {
  const checksum = await tokenChecksum(rawToken);
  return withDb(env, async (db) => {
    const rows = await db
      .select({ scope: oauthAccessTokens.scope })
      .from(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.tokenChecksum, checksum),
          gt(oauthAccessTokens.expires, sql`now()`),
        ),
      )
      .limit(1);
    if (rows.length === 0) return false;
    const scopes = String(rows[0].scope ?? "")
      .split(/\s+/)
      .filter(Boolean);
    return scopes.includes("introspection");
  });
}

export type DeviceGrantRow = {
  id: number;
  userId: number | null;
  deviceCode: string;
  userCode: string;
  scope: string;
  interval: number;
  expires: Date;
  status: string;
  clientId: string;
};

function mapDeviceGrant(r: {
  id: number;
  userId: number | null;
  deviceCode: string;
  userCode: string;
  scope: string | null;
  interval: number;
  expires: string;
  status: string;
  clientId: string;
}): DeviceGrantRow {
  return {
    id: Number(r.id),
    userId: r.userId == null ? null : Number(r.userId),
    deviceCode: String(r.deviceCode),
    userCode: String(r.userCode),
    scope: String(r.scope ?? ""),
    interval: Number(r.interval ?? DEVICE_FLOW_INTERVAL),
    expires: new Date(r.expires),
    status: String(r.status),
    clientId: String(r.clientId),
  };
}

export async function createDeviceGrant(
  env: Bindings,
  clientId: string,
  scope: string,
): Promise<DeviceGrantRow> {
  const deviceCode = generateOpaqueToken(40);
  const userCode = generateDeviceUserCode(8);
  const expireSeconds = String(DEVICE_CODE_EXPIRE_SECONDS);

  return withDb(env, async (db) => {
    const rows = await db
      .insert(oauthDeviceGrants)
      .values({
        userId: null,
        deviceCode,
        userCode,
        scope,
        interval: DEVICE_FLOW_INTERVAL,
        expires: sql`now() + (${expireSeconds}::text || ' seconds')::interval`,
        status: "authorization-pending",
        clientId,
        lastChecked: sql`now()`,
      })
      .returning({
        id: oauthDeviceGrants.id,
        userId: oauthDeviceGrants.userId,
        deviceCode: oauthDeviceGrants.deviceCode,
        userCode: oauthDeviceGrants.userCode,
        scope: oauthDeviceGrants.scope,
        interval: oauthDeviceGrants.interval,
        expires: oauthDeviceGrants.expires,
        status: oauthDeviceGrants.status,
        clientId: oauthDeviceGrants.clientId,
      });
    return mapDeviceGrant(rows[0]);
  });
}

export async function findDeviceGrantByUserCode(
  env: Bindings,
  userCode: string,
  clientId?: string,
): Promise<DeviceGrantRow | null> {
  return withDb(env, async (db) => {
    const conditions = [
      sql`upper(${oauthDeviceGrants.userCode}) = upper(${userCode})`,
    ];
    if (clientId != null) {
      conditions.push(eq(oauthDeviceGrants.clientId, clientId));
    }

    const rows = await db
      .select({
        id: oauthDeviceGrants.id,
        userId: oauthDeviceGrants.userId,
        deviceCode: oauthDeviceGrants.deviceCode,
        userCode: oauthDeviceGrants.userCode,
        scope: oauthDeviceGrants.scope,
        interval: oauthDeviceGrants.interval,
        expires: oauthDeviceGrants.expires,
        status: oauthDeviceGrants.status,
        clientId: oauthDeviceGrants.clientId,
      })
      .from(oauthDeviceGrants)
      .where(and(...conditions))
      .limit(1);

    if (rows.length === 0) return null;
    const g = mapDeviceGrant(rows[0]);
    if (g.status !== "expired" && g.expires.getTime() <= Date.now()) {
      await db
        .update(oauthDeviceGrants)
        .set({
          status: "expired",
          lastChecked: sql`now()`,
        })
        .where(eq(oauthDeviceGrants.id, g.id));
      g.status = "expired";
    }
    return g;
  });
}

export async function findDeviceGrantByDeviceCode(
  env: Bindings,
  deviceCode: string,
  clientId: string,
): Promise<DeviceGrantRow | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: oauthDeviceGrants.id,
        userId: oauthDeviceGrants.userId,
        deviceCode: oauthDeviceGrants.deviceCode,
        userCode: oauthDeviceGrants.userCode,
        scope: oauthDeviceGrants.scope,
        interval: oauthDeviceGrants.interval,
        expires: oauthDeviceGrants.expires,
        status: oauthDeviceGrants.status,
        clientId: oauthDeviceGrants.clientId,
      })
      .from(oauthDeviceGrants)
      .where(
        and(
          eq(oauthDeviceGrants.deviceCode, deviceCode),
          eq(oauthDeviceGrants.clientId, clientId),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    return mapDeviceGrant(rows[0]);
  });
}

export async function updateDeviceGrantStatus(
  env: Bindings,
  id: number,
  status: "authorized" | "denied" | "expired",
  userId: number | null,
): Promise<void> {
  await withDb(env, async (db) => {
    await db
      .update(oauthDeviceGrants)
      .set({
        status,
        userId: sql`COALESCE(${userId}, ${oauthDeviceGrants.userId})`,
        lastChecked: sql`now()`,
      })
      .where(eq(oauthDeviceGrants.id, id));
  });
}

/** device_code 認可後の access+refresh 発行。 */
export async function issueTokensForDeviceGrant(
  env: Bindings,
  grant: DeviceGrantRow,
  applicationId: number,
): Promise<IssuedTokenPair> {
  if (grant.userId == null) throw new Error("device grant has no user");
  const access = generateAccessTokenValue();
  const refresh = generateAccessTokenValue();
  const accessChecksum = await tokenChecksum(access);
  const tokenFamily = crypto.randomUUID();
  const accessExpireSeconds = String(ACCESS_TOKEN_EXPIRE_SECONDS);

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const at = await db.execute(sql`
        INSERT INTO oauth_access_tokens
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, created, updated)
         VALUES
           (${grant.userId}, NULL, ${access}, ${accessChecksum}, NULL, ${applicationId},
            now() + (${accessExpireSeconds}::text || ' seconds')::interval,
            ${grant.scope}, now(), now())
         RETURNING id
      `);
      const accessId = Number((at.rows[0] as { id: number }).id);

      await db.execute(sql`
        INSERT INTO oauth_refresh_tokens
           (user_id, token, application_id, access_token_id,
            token_family, created, updated, revoked)
         VALUES
           (${grant.userId}, ${refresh}, ${applicationId}, ${accessId},
            ${tokenFamily}::uuid, now(), now(), NULL)
      `);

      await db
        .delete(oauthDeviceGrants)
        .where(eq(oauthDeviceGrants.id, grant.id));

      await client.query("COMMIT");
      return {
        accessToken: access,
        refreshToken: refresh,
        expiresIn: ACCESS_TOKEN_EXPIRE_SECONDS,
        scope: grant.scope,
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export async function listApplicationsForUser(
  env: Bindings,
  userId: number,
): Promise<OAuthApplication[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select(applicationFields)
      .from(oauthApplications)
      .where(eq(oauthApplications.userId, userId))
      .orderBy(desc(oauthApplications.created));
    return rows.map(mapApplication);
  });
}

export async function getApplicationForUser(
  env: Bindings,
  userId: number,
  appId: number,
): Promise<OAuthApplication | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select(applicationFields)
      .from(oauthApplications)
      .where(
        and(
          eq(oauthApplications.id, appId),
          eq(oauthApplications.userId, userId),
        ),
      )
      .limit(1);
    return rows[0] ? mapApplication(rows[0]) : null;
  });
}

export type ManualApplicationInput = {
  name: string;
  clientType: "public" | "confidential";
  authorizationGrantType: string;
  redirectUris: string;
};

export async function createManualApplication(
  env: Bindings,
  userId: number,
  input: ManualApplicationInput,
): Promise<{ application: OAuthApplication; clientSecretPlain: string | null }> {
  const clientId = generateClientId();
  const rawSecret = generateClientSecret();
  const hashedSecret = await hashPassword(rawSecret);

  return withDb(env, async (db) => {
    const result = await db.execute(sql`
      INSERT INTO oauth_applications
         (client_id, user_id, redirect_uris, post_logout_redirect_uris,
          client_type, authorization_grant_type, client_secret, hash_client_secret,
          name, skip_authorization, created, updated, algorithm, allowed_origins)
       VALUES
         (${clientId}, ${userId}, ${input.redirectUris}, '', ${input.clientType},
          ${input.authorizationGrantType}, ${hashedSecret}, TRUE, ${input.name}, FALSE,
          now(), now(), '', '')
       RETURNING id, client_id, client_secret, client_type, authorization_grant_type,
                 name, redirect_uris, post_logout_redirect_uris, algorithm,
                 skip_authorization, user_id, hash_client_secret
    `);
    return {
      application: mapApplication(result.rows[0] as Record<string, unknown>),
      clientSecretPlain: input.clientType === "confidential" ? rawSecret : null,
    };
  });
}

export async function updateManualApplication(
  env: Bindings,
  userId: number,
  appId: number,
  input: ManualApplicationInput,
): Promise<OAuthApplication | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(oauthApplications)
      .set({
        name: input.name,
        clientType: input.clientType,
        authorizationGrantType: input.authorizationGrantType,
        redirectUris: input.redirectUris,
        updated: sql`now()`,
      })
      .where(
        and(
          eq(oauthApplications.id, appId),
          eq(oauthApplications.userId, userId),
        ),
      )
      .returning(applicationFields);
    return rows[0] ? mapApplication(rows[0]) : null;
  });
}

// ─── OIDC ────────────────────────────────────────────────────

export type UserinfoTokenRow = {
  userId: number;
  scope: string;
  username: string | null;
  email: string | null;
};

/** Bearer access token → userinfo 用の主体。 */
export async function findAccessTokenForUserinfo(
  env: Bindings,
  rawToken: string,
): Promise<UserinfoTokenRow | null> {
  const checksum = await tokenChecksum(rawToken);
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        userId: oauthAccessTokens.userId,
        scope: oauthAccessTokens.scope,
        username: users.username,
        email: users.email,
      })
      .from(oauthAccessTokens)
      .leftJoin(users, eq(users.id, oauthAccessTokens.userId))
      .where(
        and(
          eq(oauthAccessTokens.tokenChecksum, checksum),
          gt(oauthAccessTokens.expires, sql`now()`),
        ),
      )
      .limit(1);
    if (rows.length === 0 || rows[0].userId == null) return null;
    return {
      userId: Number(rows[0].userId),
      scope: String(rows[0].scope ?? ""),
      username: rows[0].username == null ? null : String(rows[0].username),
      email: rows[0].email == null ? null : String(rows[0].email),
    };
  });
}

export async function findIdTokenByJti(
  env: Bindings,
  jti: string,
): Promise<{ id: number; userId: number; applicationId: number; scope: string } | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: oauthIdTokens.id,
        userId: oauthIdTokens.userId,
        applicationId: oauthIdTokens.applicationId,
        scope: oauthIdTokens.scope,
      })
      .from(oauthIdTokens)
      .where(eq(oauthIdTokens.jti, jti))
      .limit(1);
    if (rows.length === 0) return null;
    return {
      id: Number(rows[0].id),
      userId: Number(rows[0].userId),
      applicationId: Number(rows[0].applicationId),
      scope: String(rows[0].scope ?? ""),
    };
  });
}

/** access token に紐づく ID Token を保存してリンク。 */
export async function saveIdTokenForAccessToken(
  env: Bindings,
  params: {
    jti: string;
    userId: number;
    applicationId: number;
    scope: string;
    accessTokenValue: string;
    expiresInSeconds: number;
  },
): Promise<void> {
  const checksum = await tokenChecksum(params.accessTokenValue);
  const expireSeconds = String(params.expiresInSeconds);

  await withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const idTokenResult = await db
        .insert(oauthIdTokens)
        .values({
          userId: params.userId,
          jti: params.jti,
          applicationId: params.applicationId,
          expires: sql`now() + (${expireSeconds}::text || ' seconds')::interval`,
          scope: params.scope,
          created: sql`now()`,
          updated: sql`now()`,
        })
        .returning({ id: oauthIdTokens.id });
      const idTokenId = Number(idTokenResult[0].id);

      await db
        .update(oauthAccessTokens)
        .set({
          idTokenId,
          updated: sql`now()`,
        })
        .where(eq(oauthAccessTokens.tokenChecksum, checksum));

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * RP-Initiated Logout: ユーザーの access/refresh/id token を削除する。
 * grant_type は authorization-code / implicit / password / client-credentials / openid-hybrid。
 */
export async function revokeTokensForOidcLogout(
  env: Bindings,
  userId: number,
): Promise<void> {
  await withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await db.execute(sql`
        DELETE FROM oauth_refresh_tokens rt
          USING oauth_access_tokens at, oauth_applications a
          WHERE rt.access_token_id = at.id
            AND at.application_id = a.id
            AND at.user_id = ${userId}
            AND a.authorization_grant_type IN (
              'authorization-code', 'implicit', 'password',
              'client-credentials', 'openid-hybrid'
            )
      `);
      await db.execute(sql`
        DELETE FROM oauth_id_tokens it
          USING oauth_access_tokens at, oauth_applications a
          WHERE at.id_token_id = it.id
            AND at.application_id = a.id
            AND at.user_id = ${userId}
            AND a.authorization_grant_type IN (
              'authorization-code', 'implicit', 'password',
              'client-credentials', 'openid-hybrid'
            )
      `);
      await db.execute(sql`
        DELETE FROM oauth_id_tokens
          WHERE user_id = ${userId}
            AND id NOT IN (
              SELECT id_token_id FROM oauth_access_tokens
               WHERE id_token_id IS NOT NULL
            )
      `);
      await db.execute(sql`
        DELETE FROM oauth_access_tokens at
          USING oauth_applications a
          WHERE at.application_id = a.id
            AND at.user_id = ${userId}
            AND a.authorization_grant_type IN (
              'authorization-code', 'implicit', 'password',
              'client-credentials', 'openid-hybrid'
            )
      `);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}
