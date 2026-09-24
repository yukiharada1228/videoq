import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	index,
	uniqueIndex,
	foreignKey,
	jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./modern";

/**
 * Better Auth always writes JS `Date` for `type: "date"` fields.
 * Official adapter schemas use Drizzle's default `mode: "date"` (not `"string"`).
 */
const baTimestamp = (name: string) => timestamp(name, { withTimezone: true });

/** Better Auth session (cookie session). */
export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: baTimestamp("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: baTimestamp("created_at").notNull().defaultNow(),
		updatedAt: baTimestamp("updated_at").notNull().defaultNow(),
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
		issuer: text("issuer").notNull(),
		userId: text("user_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: baTimestamp("access_token_expires_at"),
		refreshTokenExpiresAt: baTimestamp("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: baTimestamp("created_at").notNull().defaultNow(),
		updatedAt: baTimestamp("updated_at").notNull().defaultNow(),
	},
	(table) => [
		index("account_user_id_idx").on(table.userId),
		uniqueIndex("account_issuer_account_id_uidx").on(
			table.issuer,
			table.accountId,
		),
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
	expiresAt: baTimestamp("expires_at").notNull(),
	createdAt: baTimestamp("created_at").notNull().defaultNow(),
	updatedAt: baTimestamp("updated_at").notNull().defaultNow(),
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
		lastRefillAt: baTimestamp("last_refill_at"),
		enabled: boolean("enabled").notNull().default(true),
		rateLimitEnabled: boolean("rate_limit_enabled"),
		rateLimitTimeWindow: integer("rate_limit_time_window"),
		rateLimitMax: integer("rate_limit_max"),
		requestCount: integer("request_count"),
		remaining: integer("remaining"),
		lastRequest: baTimestamp("last_request"),
		expiresAt: baTimestamp("expires_at"),
		createdAt: baTimestamp("created_at").notNull().defaultNow(),
		updatedAt: baTimestamp("updated_at").notNull().defaultNow(),
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
	createdAt: baTimestamp("created_at").notNull().defaultNow(),
	expiresAt: baTimestamp("expires_at"),
});

/** Device authorization (RFC 8628). */
export const deviceCode = pgTable(
	"device_code",
	{
		id: text("id").primaryKey(),
		deviceCode: text("device_code").notNull(),
		userCode: text("user_code").notNull(),
		userId: text("user_id"),
		expiresAt: baTimestamp("expires_at").notNull(),
		status: text("status").notNull(),
		lastPolledAt: baTimestamp("last_polled_at"),
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
		clientDiscoveryId: text("client_discovery_id"),
		disabled: boolean("disabled").default(false),
		skipConsent: boolean("skip_consent"),
		enableEndSession: boolean("enable_end_session"),
		subjectType: text("subject_type"),
		scopes: text("scopes").array(),
		clientCredentialsScopes: text("client_credentials_scopes").array(),
		userId: text("user_id"),
		createdAt: baTimestamp("created_at").defaultNow(),
		updatedAt: baTimestamp("updated_at").defaultNow(),
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
		backchannelLogoutUri: text("backchannel_logout_uri"),
		backchannelLogoutSessionRequired: boolean(
			"backchannel_logout_session_required",
		),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		applicationType: text("application_type"),
		jwks: text("client_jwks"),
		jwksUri: text("jwks_uri"),
		grantTypes: text("grant_types").array(),
		responseTypes: text("response_types").array(),
		public: boolean("public"),
		type: text("type"),
		requirePKCE: boolean("require_pkce"),
		dpopBoundAccessTokens: boolean("dpop_bound_access_tokens")
			.notNull()
			.default(false),
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

/** Protected resources for RFC 8707 resource-bound access tokens. */
export const oauthResource = pgTable(
	"oauth_resource",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier")
			.notNull()
			.unique("oauth_resource_identifier_key"),
		name: text("name").notNull(),
		accessTokenTtl: integer("access_token_ttl"),
		refreshTokenTtl: integer("refresh_token_ttl"),
		signingAlgorithm: text("signing_algorithm"),
		signingKeyId: text("signing_key_id"),
		allowedScopes: text("allowed_scopes").array(),
		customClaims: jsonb("custom_claims"),
		dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required")
			.notNull()
			.default(false),
		disabled: boolean("disabled").notNull().default(false),
		createdAt: baTimestamp("created_at").defaultNow(),
		updatedAt: baTimestamp("updated_at").defaultNow(),
		policyVersion: integer("policy_version").notNull().default(1),
		metadata: jsonb("metadata"),
	},
);

/** OAuth client-to-resource allowlist. */
export const oauthClientResource = pgTable(
	"oauth_client_resource",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull(),
		resourceId: text("resource_id").notNull(),
		metadata: jsonb("metadata"),
		createdAt: baTimestamp("created_at").defaultNow(),
	},
	(table) => [
		index("oauth_client_resource_client_id_idx").on(table.clientId),
		index("oauth_client_resource_resource_id_idx").on(table.resourceId),
		uniqueIndex("oauth_client_resource_client_resource_uidx").on(
			table.clientId,
			table.resourceId,
		),
		foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_client_resource_client_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.resourceId],
			// Better Auth stores the RFC 8707 resource identifier (the URL),
			// not oauth_resource's internal row id, in this join table.
			foreignColumns: [oauthResource.identifier],
			name: "oauth_client_resource_resource_id_fkey",
		}).onDelete("cascade"),
	],
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id").notNull(),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		expiresAt: baTimestamp("expires_at"),
		createdAt: baTimestamp("created_at").defaultNow(),
		revoked: baTimestamp("revoked"),
		rotatedAt: baTimestamp("rotated_at"),
		rotationReplayResponse: text("rotation_replay_response"),
		rotationReplayExpiresAt: baTimestamp("rotation_replay_expires_at"),
		authTime: baTimestamp("auth_time"),
		confirmation: jsonb("confirmation"),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_refresh_token_user_id_idx").on(table.userId),
		index("oauth_refresh_token_client_id_idx").on(table.clientId),
		index("oauth_refresh_token_session_id_idx").on(table.sessionId),
		index("oauth_refresh_token_authorization_code_id_idx").on(
			table.authorizationCodeId,
		),
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
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [session.id],
			name: "oauth_refresh_token_session_id_fkey",
		}).onDelete("set null"),
	],
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token").unique(),
		clientId: text("client_id").notNull(),
		sessionId: text("session_id"),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		authorizationCodeId: text("authorization_code_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		refreshId: text("refresh_id"),
		expiresAt: baTimestamp("expires_at"),
		createdAt: baTimestamp("created_at").defaultNow(),
		revoked: baTimestamp("revoked"),
		confirmation: jsonb("confirmation"),
		scopes: text("scopes").array().notNull(),
	},
	(table) => [
		index("oauth_access_token_user_id_idx").on(table.userId),
		index("oauth_access_token_client_id_idx").on(table.clientId),
		index("oauth_access_token_session_id_idx").on(table.sessionId),
		index("oauth_access_token_authorization_code_id_idx").on(
			table.authorizationCodeId,
		),
		index("oauth_access_token_refresh_id_idx").on(table.refreshId),
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
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [session.id],
			name: "oauth_access_token_session_id_fkey",
		}).onDelete("set null"),
		foreignKey({
			columns: [table.refreshId],
			foreignColumns: [oauthRefreshToken.id],
			name: "oauth_access_token_refresh_id_fkey",
		}),
	],
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull(),
		userId: text("user_id"),
		referenceId: text("reference_id"),
		resources: text("resources").array(),
		requestedUserInfoClaims: text("requested_user_info_claims").array(),
		scopes: text("scopes").array().notNull(),
		createdAt: baTimestamp("created_at").defaultNow(),
		updatedAt: baTimestamp("updated_at").defaultNow(),
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

/** One-time private_key_jwt client assertion ids. */
export const oauthClientAssertion = pgTable("oauth_client_assertion", {
	id: text("id").primaryKey(),
	expiresAt: baTimestamp("expires_at").notNull(),
});
