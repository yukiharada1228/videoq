/**
 * django-oauth-toolkit 互換テーブル（名前維持。Python DOT パッケージは不要）。
 * 列は Hono repository が参照するものを中心に定義。
 */
import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const oauthApplication = pgTable("oauth2_provider_application", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  clientId: varchar("client_id", { length: 100 }).notNull(),
  userId: bigint("user_id", { mode: "number" }),
  redirectUris: text("redirect_uris").notNull().default(""),
  postLogoutRedirectUris: text("post_logout_redirect_uris").notNull().default(""),
  clientType: varchar("client_type", { length: 32 }).notNull(),
  authorizationGrantType: varchar("authorization_grant_type", { length: 32 }).notNull(),
  clientSecret: text("client_secret").notNull().default(""),
  hashClientSecret: boolean("hash_client_secret").notNull().default(true),
  name: varchar("name", { length: 255 }).notNull().default(""),
  skipAuthorization: boolean("skip_authorization").notNull().default(false),
  created: timestamp("created", { withTimezone: true }).notNull(),
  updated: timestamp("updated", { withTimezone: true }).notNull(),
  algorithm: varchar("algorithm", { length: 5 }).notNull().default(""),
  allowedOrigins: text("allowed_origins").notNull().default(""),
  registrationSource: varchar("registration_source", { length: 16 })
    .notNull()
    .default("manual"),
  cimdExpiresAt: timestamp("cimd_expires_at", { withTimezone: true }),
});

export const oauthGrant = pgTable("oauth2_provider_grant", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  code: varchar("code", { length: 255 }).notNull(),
  applicationId: bigint("application_id", { mode: "number" }).notNull(),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  redirectUri: text("redirect_uri").notNull(),
  scope: text("scope").notNull().default(""),
  created: timestamp("created", { withTimezone: true }).notNull(),
  updated: timestamp("updated", { withTimezone: true }).notNull(),
  codeChallenge: varchar("code_challenge", { length: 128 }).notNull().default(""),
  codeChallengeMethod: varchar("code_challenge_method", { length: 10 })
    .notNull()
    .default(""),
  nonce: varchar("nonce", { length: 255 }).notNull().default(""),
  claims: jsonb("claims").notNull().default({}),
  resource: jsonb("resource").notNull().default([]),
});

export const oauthAccessToken = pgTable("oauth2_provider_accesstoken", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }),
  sourceRefreshTokenId: bigint("source_refresh_token_id", { mode: "number" }),
  token: varchar("token", { length: 255 }).notNull(),
  tokenChecksum: varchar("token_checksum", { length: 64 }).notNull(),
  idTokenId: bigint("id_token_id", { mode: "number" }),
  applicationId: bigint("application_id", { mode: "number" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  scope: text("scope").notNull().default(""),
  resource: jsonb("resource").notNull().default([]),
  created: timestamp("created", { withTimezone: true }).notNull(),
  updated: timestamp("updated", { withTimezone: true }).notNull(),
});

export const oauthRefreshToken = pgTable("oauth2_provider_refreshtoken", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  token: varchar("token", { length: 255 }).notNull(),
  tokenChecksum: varchar("token_checksum", { length: 64 }).notNull(),
  applicationId: bigint("application_id", { mode: "number" }).notNull(),
  accessTokenId: bigint("access_token_id", { mode: "number" }),
  tokenFamily: uuid("token_family"),
  resource: jsonb("resource").notNull().default([]),
  created: timestamp("created", { withTimezone: true }).notNull(),
  updated: timestamp("updated", { withTimezone: true }).notNull(),
  revoked: timestamp("revoked", { withTimezone: true }),
});

export const oauthIdToken = pgTable("oauth2_provider_idtoken", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }),
  jti: uuid("jti").notNull(),
  applicationId: bigint("application_id", { mode: "number" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  scope: text("scope").notNull().default(""),
  created: timestamp("created", { withTimezone: true }).notNull(),
  updated: timestamp("updated", { withTimezone: true }).notNull(),
});

export const oauthDeviceGrant = pgTable("oauth2_provider_devicegrant", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }),
  deviceCode: varchar("device_code", { length: 100 }).notNull(),
  userCode: varchar("user_code", { length: 100 }).notNull(),
  scope: text("scope").notNull().default(""),
  interval: integer("interval").notNull().default(5),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 64 }).notNull().default("authorization-pending"),
  clientId: varchar("client_id", { length: 100 }).notNull(),
  lastChecked: timestamp("last_checked", { withTimezone: true }).notNull(),
});
