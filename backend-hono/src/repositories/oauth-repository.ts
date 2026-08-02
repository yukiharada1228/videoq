import { withDb } from "../db/pool";
import type { Bindings } from "../types/bindings";
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
import { hashDjangoPassword, verifyDjangoPassword } from "../lib/password";

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
  /** "" | "RS256" | "HS256"（DOT Application.algorithm） */
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

/**
 * ユーザーが認可した未期限切れ AccessToken（`list_for_user` 相当）。
 * created/expires は Python `datetime.isoformat()`（UTC）に合わせる。
 */
export async function listAuthorizedTokens(
  env: Bindings,
  userId: number,
): Promise<AuthorizedTokenItem[]> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT t.id, t.scope,
              coalesce(a.client_id, '') AS client_id,
              coalesce(a.name, '') AS client_name,
              CASE
                WHEN to_char(t.created AT TIME ZONE 'UTC', 'US') = '000000'
                THEN to_char(t.created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '+00:00'
                ELSE to_char(t.created AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
              END AS issued_at,
              CASE
                WHEN t.expires IS NULL THEN NULL
                WHEN to_char(t.expires AT TIME ZONE 'UTC', 'US') = '000000'
                THEN to_char(t.expires AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') || '+00:00'
                ELSE to_char(t.expires AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '+00:00'
              END AS expires_at
         FROM oauth2_provider_accesstoken t
         LEFT JOIN oauth2_provider_application a ON a.id = t.application_id
        WHERE t.user_id = $1 AND t.expires > now()
        ORDER BY t.created DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      client_id: r.client_id as string,
      client_name: r.client_name as string,
      scope: (r.scope as string) ?? "",
      issued_at: r.issued_at as string,
      expires_at: (r.expires_at as string | null) ?? null,
    }));
  });
}

/** 所有者のトークンを削除（`revoke_for_user`）。成功=true。 */
export async function revokeAuthorizedToken(
  env: Bindings,
  userId: number,
  tokenId: number,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `DELETE FROM oauth2_provider_accesstoken
        WHERE id = $1 AND user_id = $2`,
      [tokenId, userId],
    );
    return (r.rowCount ?? 0) > 0;
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT user_id, scope FROM oauth2_provider_accesstoken
        WHERE token_checksum = $1
          AND expires > now()
          AND user_id IS NOT NULL`,
      [tokenChecksumHex],
    );
    if (rows.length === 0) return null;
    return {
      userId: Number(rows[0].user_id),
      scope: (rows[0].scope as string) ?? "",
    };
  });
}

function mapApplication(r: Record<string, unknown>): OAuthApplication {
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
    registration_source: (r.registration_source as string) ?? "manual",
    hash_client_secret: r.hash_client_secret !== false,
  };
}

const APPLICATION_SELECT = `id, client_id, client_secret, client_type, authorization_grant_type,
              name, redirect_uris, post_logout_redirect_uris, algorithm,
              skip_authorization, user_id, registration_source, hash_client_secret`;

export async function findApplicationByClientId(
  env: Bindings,
  clientId: string,
): Promise<OAuthApplication | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT ${APPLICATION_SELECT}
         FROM oauth2_provider_application
        WHERE client_id = $1`,
      [clientId],
    );
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
  if (app.hash_client_secret || app.client_secret.startsWith("pbkdf2_")) {
    return verifyDjangoPassword(plaintext, app.client_secret);
  }
  return plaintext === app.client_secret;
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
  const hashedSecret = await hashDjangoPassword(rawSecret);
  const redirectUris = input.redirectUris.join(" ");

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `INSERT INTO oauth2_provider_application
           (client_id, user_id, redirect_uris, post_logout_redirect_uris,
            client_type, authorization_grant_type, client_secret, hash_client_secret,
            name, skip_authorization, created, updated, algorithm, allowed_origins,
            registration_source, cimd_expires_at)
         VALUES
           ($1, NULL, $2, '', $3, $4, $5, TRUE, $6, FALSE, now(), now(), '', '',
            'dcr', NULL)
         RETURNING ${APPLICATION_SELECT}`,
        [
          clientId,
          redirectUris,
          input.clientType,
          input.authorizationGrantType,
          hashedSecret,
          input.name,
        ],
      );
      const application = mapApplication(rows[0]);

      const regToken = generateClientSecret();
      const checksum = await tokenChecksum(regToken);
      await client.query(
        `INSERT INTO oauth2_provider_accesstoken
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, resource, created, updated)
         VALUES
           (NULL, NULL, $1, $2, NULL, $3, $4, $5, '[]'::jsonb, now(), now())`,
        [
          regToken,
          checksum,
          application.id,
          DCR_REGISTRATION_TOKEN_EXPIRES.toISOString(),
          DCR_REGISTRATION_SCOPE,
        ],
      );

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
 * DCR_ROTATE_REGISTRATION_TOKEN_ON_UPDATE=True 相当（新トークン発行→旧削除）。
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
      await client.query(
        `UPDATE oauth2_provider_application
            SET redirect_uris = $2, client_type = $3, authorization_grant_type = $4,
                name = $5, updated = now()
          WHERE id = $1`,
        [appId, redirectUris, fields.clientType, fields.authorizationGrantType, fields.name],
      );
      // rotation: 新トークン発行 → 旧トークン削除
      await client.query(
        `INSERT INTO oauth2_provider_accesstoken
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, resource, created, updated)
         VALUES (NULL, NULL, $1, $2, NULL, $3, $4, $5, '[]'::jsonb, now(), now())`,
        [
          newRegToken,
          newChecksum,
          appId,
          DCR_REGISTRATION_TOKEN_EXPIRES.toISOString(),
          DCR_REGISTRATION_SCOPE,
        ],
      );
      await client.query(
        `DELETE FROM oauth2_provider_accesstoken WHERE token_checksum = $1`,
        [oldChecksum],
      );
      await client.query("COMMIT");
      return newRegToken;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * DCR クライアント削除（RFC 7592 DELETE）。application.delete() 相当で子（token/grant/
 * idtoken/refreshtoken）を tx で先に削除（FK は deferrable なので順序は柔軟）。
 */
export async function deleteOAuthApplicationCascade(
  env: Bindings,
  appId: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM oauth2_provider_grant WHERE application_id = $1`, [appId]);
      await client.query(`DELETE FROM oauth2_provider_refreshtoken WHERE application_id = $1`, [appId]);
      await client.query(`DELETE FROM oauth2_provider_idtoken WHERE application_id = $1`, [appId]);
      await client.query(`DELETE FROM oauth2_provider_accesstoken WHERE application_id = $1`, [appId]);
      await client.query(`DELETE FROM oauth2_provider_application WHERE id = $1`, [appId]);
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT t.token, t.scope, t.expires, t.application_id,
              a.id, a.client_id, a.client_secret, a.client_type, a.authorization_grant_type,
              a.name, a.redirect_uris, a.post_logout_redirect_uris, a.algorithm,
              a.skip_authorization, a.user_id, a.registration_source, a.hash_client_secret
         FROM oauth2_provider_accesstoken t
         JOIN oauth2_provider_application a ON a.id = t.application_id
        WHERE t.token_checksum = $1
          AND t.expires > now()`,
      [checksum],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    const scope = new Set(String(r.scope ?? "").split(/\s+/).filter(Boolean));
    if (!scope.has(DCR_REGISTRATION_SCOPE)) return null;
    if (r.client_id !== clientId) return null;
    if (r.registration_source !== "dcr") return null;
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
  return withDb(env, async (db, client) => {
    await client.query(
      `INSERT INTO oauth2_provider_grant
         (user_id, code, application_id, expires, redirect_uri, scope,
          created, updated, code_challenge, code_challenge_method, nonce, claims, resource)
       VALUES
         ($1, $2, $3, now() + ($4::text || ' seconds')::interval, $5, $6,
          now(), now(), $7, $8, $9, '{}', $10::jsonb)`,
      [
        params.userId,
        code,
        params.applicationId,
        String(AUTHORIZATION_CODE_EXPIRE_SECONDS),
        params.redirectUri,
        params.scope,
        params.codeChallenge,
        params.codeChallengeMethod,
        params.nonce ?? "",
        JSON.stringify(params.resource),
      ],
    );
    return code;
  });
}

export async function findValidGrant(
  env: Bindings,
  code: string,
  applicationId: number,
): Promise<OAuthGrant | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, code, application_id, expires, redirect_uri, scope,
              code_challenge, code_challenge_method, resource, nonce
         FROM oauth2_provider_grant
        WHERE code = $1 AND application_id = $2 AND expires > now()`,
      [code, applicationId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    let resource: string[] = [];
    if (Array.isArray(r.resource)) resource = r.resource as string[];
    else if (typeof r.resource === "string") {
      try {
        const parsed = JSON.parse(r.resource);
        if (Array.isArray(parsed)) resource = parsed;
      } catch {
        resource = [];
      }
    }
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
      resource,
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
  const refreshChecksum = await tokenChecksum(refresh);
  const tokenFamily = crypto.randomUUID();
  const resourceJson = JSON.stringify(grant.resource);

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const at = await client.query(
        `INSERT INTO oauth2_provider_accesstoken
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, resource, created, updated)
         VALUES
           ($1, NULL, $2, $3, NULL, $4,
            now() + ($5::text || ' seconds')::interval, $6, $7::jsonb, now(), now())
         RETURNING id`,
        [
          grant.user_id,
          access,
          accessChecksum,
          applicationId,
          String(ACCESS_TOKEN_EXPIRE_SECONDS),
          grant.scope,
          resourceJson,
        ],
      );
      const accessId = Number(at.rows[0].id);

      await client.query(
        `INSERT INTO oauth2_provider_refreshtoken
           (user_id, token, token_checksum, application_id, access_token_id,
            token_family, resource, created, updated, revoked)
         VALUES
           ($1, $2, $3, $4, $5, $6::uuid, $7::jsonb, now(), now(), NULL)`,
        [
          grant.user_id,
          refresh,
          refreshChecksum,
          applicationId,
          accessId,
          tokenFamily,
          resourceJson,
        ],
      );

      await client.query(`DELETE FROM oauth2_provider_grant WHERE id = $1`, [
        grant.id,
      ]);

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
  const checksum = await tokenChecksum(rawRefresh);
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT r.id, r.user_id, r.application_id, r.access_token_id, r.token_family,
              r.resource, r.created, coalesce(a.scope, '') AS scope
         FROM oauth2_provider_refreshtoken r
         LEFT JOIN oauth2_provider_accesstoken a ON a.id = r.access_token_id
        WHERE r.token_checksum = $1
          AND r.revoked IS NULL
          AND r.application_id = $2
        ORDER BY r.id DESC
        LIMIT 1`,
      [checksum, applicationId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    let resource: string[] = [];
    if (Array.isArray(r.resource)) resource = r.resource as string[];
    return {
      id: Number(r.id),
      user_id: Number(r.user_id),
      application_id: Number(r.application_id),
      access_token_id: r.access_token_id == null ? null : Number(r.access_token_id),
      token_family: (r.token_family as string | null) ?? null,
      scope: (r.scope as string) || "read",
      resource,
      created: new Date(r.created as string),
    };
  });
}

/** refresh_token grant（ROTATE_REFRESH_TOKEN=True 相当）。 */
export async function rotateRefreshToken(
  env: Bindings,
  old: RefreshRow,
): Promise<IssuedTokenPair> {
  const access = generateAccessTokenValue();
  const refresh = generateAccessTokenValue();
  const accessChecksum = await tokenChecksum(access);
  const refreshChecksum = await tokenChecksum(refresh);
  const tokenFamily = old.token_family ?? crypto.randomUUID();
  const resourceJson = JSON.stringify(old.resource);

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      if (old.access_token_id != null) {
        await client.query(
          `DELETE FROM oauth2_provider_accesstoken WHERE id = $1`,
          [old.access_token_id],
        );
      }
      await client.query(
        `UPDATE oauth2_provider_refreshtoken
            SET revoked = now(), access_token_id = NULL, updated = now()
          WHERE id = $1 AND revoked IS NULL`,
        [old.id],
      );

      const at = await client.query(
        `INSERT INTO oauth2_provider_accesstoken
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, resource, created, updated)
         VALUES
           ($1, $2, $3, $4, NULL, $5,
            now() + ($6::text || ' seconds')::interval, $7, $8::jsonb, now(), now())
         RETURNING id`,
        [
          old.user_id,
          old.id,
          access,
          accessChecksum,
          old.application_id,
          String(ACCESS_TOKEN_EXPIRE_SECONDS),
          old.scope,
          resourceJson,
        ],
      );
      const accessId = Number(at.rows[0].id);

      await client.query(
        `INSERT INTO oauth2_provider_refreshtoken
           (user_id, token, token_checksum, application_id, access_token_id,
            token_family, resource, created, updated, revoked)
         VALUES
           ($1, $2, $3, $4, $5, $6::uuid, $7::jsonb, now(), now(), NULL)`,
        [
          old.user_id,
          refresh,
          refreshChecksum,
          old.application_id,
          accessId,
          tokenFamily,
          resourceJson,
        ],
      );

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
  await withDb(env, async (db, client) => {
    const tryAccess = async () => {
      await client.query(
        `DELETE FROM oauth2_provider_accesstoken
          WHERE token_checksum = $1 AND application_id = $2`,
        [checksum, applicationId],
      );
    };
    const tryRefresh = async () => {
      const { rows } = await client.query(
        `SELECT id, access_token_id FROM oauth2_provider_refreshtoken
          WHERE token_checksum = $1 AND application_id = $2 AND revoked IS NULL`,
        [checksum, applicationId],
      );
      for (const r of rows) {
        if (r.access_token_id != null) {
          await client.query(
            `DELETE FROM oauth2_provider_accesstoken WHERE id = $1`,
            [r.access_token_id],
          );
        }
        await client.query(
          `UPDATE oauth2_provider_refreshtoken
              SET revoked = now(), access_token_id = NULL, updated = now()
            WHERE id = $1`,
          [r.id],
        );
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT t.scope, extract(epoch from t.expires)::bigint AS exp,
              coalesce(a.client_id, '') AS client_id,
              u.username
         FROM oauth2_provider_accesstoken t
         LEFT JOIN oauth2_provider_application a ON a.id = t.application_id
         LEFT JOIN app_user u ON u.id = t.user_id
        WHERE t.token_checksum = $1 AND t.expires > now()`,
      [checksum],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      active: true,
      scope: (r.scope as string) ?? "",
      exp: Number(r.exp),
      client_id: r.client_id as string,
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT scope FROM oauth2_provider_accesstoken
        WHERE token_checksum = $1 AND expires > now()`,
      [checksum],
    );
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

function mapDeviceGrant(r: Record<string, unknown>): DeviceGrantRow {
  return {
    id: Number(r.id),
    userId: r.user_id == null ? null : Number(r.user_id),
    deviceCode: String(r.device_code),
    userCode: String(r.user_code),
    scope: String(r.scope ?? ""),
    interval: Number(r.interval ?? DEVICE_FLOW_INTERVAL),
    expires: new Date(r.expires as string),
    status: String(r.status),
    clientId: String(r.client_id),
  };
}

export async function createDeviceGrant(
  env: Bindings,
  clientId: string,
  scope: string,
): Promise<DeviceGrantRow> {
  const deviceCode = generateOpaqueToken(40);
  const userCode = generateDeviceUserCode(8);
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO oauth2_provider_devicegrant
         (user_id, device_code, user_code, scope, interval, expires, status, client_id, last_checked)
       VALUES
         (NULL, $1, $2, $3, $4,
          now() + ($5::text || ' seconds')::interval,
          'authorization-pending', $6, now())
       RETURNING id, user_id, device_code, user_code, scope, interval, expires, status, client_id`,
      [
        deviceCode,
        userCode,
        scope,
        DEVICE_FLOW_INTERVAL,
        String(DEVICE_CODE_EXPIRE_SECONDS),
        clientId,
      ],
    );
    return mapDeviceGrant(rows[0]);
  });
}

export async function findDeviceGrantByUserCode(
  env: Bindings,
  userCode: string,
  clientId?: string,
): Promise<DeviceGrantRow | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      clientId
        ? `SELECT id, user_id, device_code, user_code, scope, interval, expires, status, client_id
             FROM oauth2_provider_devicegrant
            WHERE upper(user_code) = upper($1) AND client_id = $2`
        : `SELECT id, user_id, device_code, user_code, scope, interval, expires, status, client_id
             FROM oauth2_provider_devicegrant
            WHERE upper(user_code) = upper($1)`,
      clientId ? [userCode, clientId] : [userCode],
    );
    if (rows.length === 0) return null;
    const g = mapDeviceGrant(rows[0]);
    if (g.status !== "expired" && g.expires.getTime() <= Date.now()) {
      await client.query(
        `UPDATE oauth2_provider_devicegrant SET status = 'expired', last_checked = now() WHERE id = $1`,
        [g.id],
      );
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, device_code, user_code, scope, interval, expires, status, client_id
         FROM oauth2_provider_devicegrant
        WHERE device_code = $1 AND client_id = $2`,
      [deviceCode, clientId],
    );
    if (rows.length === 0) return null;
    const g = mapDeviceGrant(rows[0]);
    // DOT TokenView はポーリング時 is_expired を呼ばない（user_code 検証時のみ）
    return g;
  });
}

export async function updateDeviceGrantStatus(
  env: Bindings,
  id: number,
  status: "authorized" | "denied" | "expired",
  userId: number | null,
): Promise<void> {
  await withDb(env, async (db, client) => {
    await client.query(
      `UPDATE oauth2_provider_devicegrant
          SET status = $2, user_id = COALESCE($3, user_id), last_checked = now()
        WHERE id = $1`,
      [id, status, userId],
    );
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
  const refreshChecksum = await tokenChecksum(refresh);
  const tokenFamily = crypto.randomUUID();

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const at = await client.query(
        `INSERT INTO oauth2_provider_accesstoken
           (user_id, source_refresh_token_id, token, token_checksum, id_token_id,
            application_id, expires, scope, resource, created, updated)
         VALUES
           ($1, NULL, $2, $3, NULL, $4,
            now() + ($5::text || ' seconds')::interval, $6, '[]'::jsonb, now(), now())
         RETURNING id`,
        [
          grant.userId,
          access,
          accessChecksum,
          applicationId,
          String(ACCESS_TOKEN_EXPIRE_SECONDS),
          grant.scope,
        ],
      );
      const accessId = Number(at.rows[0].id);
      await client.query(
        `INSERT INTO oauth2_provider_refreshtoken
           (user_id, token, token_checksum, application_id, access_token_id,
            token_family, resource, created, updated, revoked)
         VALUES
           ($1, $2, $3, $4, $5, $6::uuid, '[]'::jsonb, now(), now(), NULL)`,
        [
          grant.userId,
          refresh,
          refreshChecksum,
          applicationId,
          accessId,
          tokenFamily,
        ],
      );
      await client.query(
        `DELETE FROM oauth2_provider_devicegrant WHERE id = $1`,
        [grant.id],
      );
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT ${APPLICATION_SELECT}
         FROM oauth2_provider_application
        WHERE user_id = $1
        ORDER BY created DESC`,
      [userId],
    );
    return rows.map(mapApplication);
  });
}

export async function getApplicationForUser(
  env: Bindings,
  userId: number,
  appId: number,
): Promise<OAuthApplication | null> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT ${APPLICATION_SELECT}
         FROM oauth2_provider_application
        WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
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
  const hashedSecret = await hashDjangoPassword(rawSecret);
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO oauth2_provider_application
         (client_id, user_id, redirect_uris, post_logout_redirect_uris,
          client_type, authorization_grant_type, client_secret, hash_client_secret,
          name, skip_authorization, created, updated, algorithm, allowed_origins,
          registration_source, cimd_expires_at)
       VALUES
         ($1, $2, $3, '', $4, $5, $6, TRUE, $7, FALSE, now(), now(), '', '',
          'manual', NULL)
       RETURNING ${APPLICATION_SELECT}`,
      [
        clientId,
        userId,
        input.redirectUris,
        input.clientType,
        input.authorizationGrantType,
        hashedSecret,
        input.name,
      ],
    );
    return {
      application: mapApplication(rows[0]),
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `UPDATE oauth2_provider_application
          SET name = $3, client_type = $4, authorization_grant_type = $5,
              redirect_uris = $6, updated = now()
        WHERE id = $1 AND user_id = $2
        RETURNING ${APPLICATION_SELECT}`,
      [
        appId,
        userId,
        input.name,
        input.clientType,
        input.authorizationGrantType,
        input.redirectUris,
      ],
    );
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT t.user_id, t.scope, u.username, u.email
         FROM oauth2_provider_accesstoken t
         LEFT JOIN app_user u ON u.id = t.user_id
        WHERE t.token_checksum = $1 AND t.expires > now()`,
      [checksum],
    );
    if (rows.length === 0 || rows[0].user_id == null) return null;
    return {
      userId: Number(rows[0].user_id),
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, application_id, scope
         FROM oauth2_provider_idtoken
        WHERE jti = $1::uuid`,
      [jti],
    );
    if (rows.length === 0) return null;
    return {
      id: Number(rows[0].id),
      userId: Number(rows[0].user_id),
      applicationId: Number(rows[0].application_id),
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
  await withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `INSERT INTO oauth2_provider_idtoken
           (user_id, jti, application_id, expires, scope, created, updated)
         VALUES
           ($1, $2::uuid, $3,
            now() + ($4::text || ' seconds')::interval, $5, now(), now())
         RETURNING id`,
        [
          params.userId,
          params.jti,
          params.applicationId,
          String(params.expiresInSeconds),
          params.scope,
        ],
      );
      const idTokenId = Number(rows[0].id);
      await client.query(
        `UPDATE oauth2_provider_accesstoken
            SET id_token_id = $2, updated = now()
          WHERE token_checksum = $1`,
        [checksum, idTokenId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * RP-Initiated Logout: ユーザーの access/refresh/id token を削除（DOT do_logout 相当）。
 * grant_type は authorization-code / implicit / password / client-credentials / openid-hybrid。
 */
export async function revokeTokensForOidcLogout(
  env: Bindings,
  userId: number,
): Promise<void> {
  await withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM oauth2_provider_refreshtoken rt
          USING oauth2_provider_accesstoken at, oauth2_provider_application a
          WHERE rt.access_token_id = at.id
            AND at.application_id = a.id
            AND at.user_id = $1
            AND a.authorization_grant_type IN (
              'authorization-code', 'implicit', 'password',
              'client-credentials', 'openid-hybrid'
            )`,
        [userId],
      );
      await client.query(
        `DELETE FROM oauth2_provider_idtoken it
          USING oauth2_provider_accesstoken at, oauth2_provider_application a
          WHERE at.id_token_id = it.id
            AND at.application_id = a.id
            AND at.user_id = $1
            AND a.authorization_grant_type IN (
              'authorization-code', 'implicit', 'password',
              'client-credentials', 'openid-hybrid'
            )`,
        [userId],
      );
      // 孤立 ID token（access 未リンク）
      await client.query(
        `DELETE FROM oauth2_provider_idtoken
          WHERE user_id = $1
            AND id NOT IN (
              SELECT id_token_id FROM oauth2_provider_accesstoken
               WHERE id_token_id IS NOT NULL
            )`,
        [userId],
      );
      await client.query(
        `DELETE FROM oauth2_provider_accesstoken at
          USING oauth2_provider_application a
          WHERE at.application_id = a.id
            AND at.user_id = $1
            AND a.authorization_grant_type IN (
              'authorization-code', 'implicit', 'password',
              'client-credentials', 'openid-hybrid'
            )`,
        [userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}
