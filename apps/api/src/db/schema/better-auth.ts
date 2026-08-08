import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	bigint,
	index,
	uniqueIndex,
	foreignKey,
	jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./modern";

/** Better Auth session (cookie session). */
export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id").notNull(),
		impersonatedBy: text("impersonated_by"),
	},
	(table) => [
		index("session_user_id_idx").on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "session_user_id_fkey",
		}).onDelete("cascade"),
	],
);

/** Better Auth account (credential password lives here). */
export const account = pgTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: timestamp("access_token_expires_at", {
			withTimezone: true,
			mode: "string",
		}),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
			withTimezone: true,
			mode: "string",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
	},
	(table) => [
		index("account_user_id_idx").on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "account_user_id_fkey",
		}).onDelete("cascade"),
	],
);

/** Better Auth verification (email verify / password reset). */
export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
});

/** Better Auth API keys (@better-auth/api-key). */
export const apikey = pgTable(
	"apikey",
	{
		id: text("id").primaryKey(),
		configId: text("config_id").notNull().default("default"),
		name: text("name"),
		start: text("start"),
		referenceId: text("reference_id").notNull(),
		prefix: text("prefix"),
		key: text("key").notNull(),
		refillInterval: integer("refill_interval"),
		refillAmount: integer("refill_amount"),
		lastRefillAt: timestamp("last_refill_at", { withTimezone: true, mode: "string" }),
		enabled: boolean("enabled").notNull().default(true),
		rateLimitEnabled: boolean("rate_limit_enabled"),
		rateLimitTimeWindow: integer("rate_limit_time_window"),
		rateLimitMax: integer("rate_limit_max"),
		requestCount: integer("request_count"),
		remaining: integer("remaining"),
		lastRequest: timestamp("last_request", { withTimezone: true, mode: "string" }),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
		permissions: text("permissions"),
		metadata: text("metadata"),
	},
	(table) => [
		index("apikey_reference_id_idx").on(table.referenceId),
		index("apikey_key_idx").on(table.key),
	],
);

/** JWT plugin JWKS storage. */
export const jwks = pgTable("jwks", {
	id: text("id").primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
});

/** Device authorization (RFC 8628). */
export const deviceCode = pgTable(
	"device_code",
	{
		id: text("id").primaryKey(),
		deviceCode: text("device_code").notNull(),
		userCode: text("user_code").notNull(),
		userId: text("user_id"),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
		status: text("status").notNull(),
		lastPolledAt: timestamp("last_polled_at", { withTimezone: true, mode: "string" }),
		pollingInterval: integer("polling_interval"),
		clientId: text("client_id"),
		scope: text("scope"),
	},
	(table) => [
		uniqueIndex("device_code_device_code_uidx").on(table.deviceCode),
		index("device_code_user_code_idx").on(table.userCode),
	],
);

/** OAuth 2.1 provider clients. */
export const oauthClient = pgTable(
	"oauth_client",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		disabled: boolean("disabled").default(false),
		skipConsent: boolean("skip_consent"),
		enableEndSession: boolean("enable_end_session"),
		subjectType: text("subject_type"),
		scopes: text("scopes").array(),
		userId: text("user_id"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: text("contacts").array(),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: text("redirect_uris").array().notNull(),
		postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		grantTypes: text("grant_types").array(),
		responseTypes: text("response_types").array(),
		public: boolean("public"),
		type: text("type"),
		requirePKCE: boolean("require_pkce"),
		referenceId: text("reference_id"),
		metadata: jsonb("metadata"),
	},
	(table) => [
		index("oauth_client_user_id_idx").on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "oauth_client_user_id_fkey",
		}).onDelete("set null"),
	],
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id").notNull(),
		referenceId: text("reference_id"),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
		revoked: timestamp("revoked", { withTimezone: true, mode: "string" }),
		authTime: timestamp("auth_time", { withTimezone: true, mode: "string" }),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_refresh_token_user_id_idx").on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "oauth_refresh_token_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_refresh_token_client_id_fkey",
		}).onDelete("cascade"),
	],
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token"),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		refreshId: text("refresh_id"),
		expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_access_token_user_id_idx").on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "oauth_access_token_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_access_token_client_id_fkey",
		}).onDelete("cascade"),
	],
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull(),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		scopes: text("scopes").array().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
	},
	(table) => [
		index("oauth_consent_user_id_idx").on(table.userId),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "oauth_consent_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_consent_client_id_fkey",
		}).onDelete("cascade"),
	],
);
