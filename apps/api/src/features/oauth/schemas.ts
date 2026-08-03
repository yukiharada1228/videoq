import { z } from "../../shared/openapi";

export const oauthAuthorizationServerMetadataSchema = z
  .object({
    issuer: z.string(),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    registration_endpoint: z.string(),
    revocation_endpoint: z.string(),
    introspection_endpoint: z.string(),
    device_authorization_endpoint: z.string(),
    response_types_supported: z.array(z.string()),
    grant_types_supported: z.array(z.string()),
    scopes_supported: z.array(z.string()),
    code_challenge_methods_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()),
    revocation_endpoint_auth_methods_supported: z.array(z.string()),
    client_id_metadata_document_supported: z.boolean(),
  })
  .openapi("OAuthAuthorizationServerMetadata");

export const oauthProtectedResourceMetadataSchema = z
  .object({
    resource: z.string(),
    authorization_servers: z.array(z.string()),
    scopes_supported: z.array(z.string()),
    bearer_methods_supported: z.array(z.string()),
    resource_documentation: z.string(),
  })
  .openapi("OAuthProtectedResourceMetadata");

export const oauthTokenItemSchema = z
  .object({
    id: z.number().int(),
    client_id: z.string(),
    client_name: z.string(),
    scope: z.string(),
    issued_at: z.string(),
    expires_at: z.string().nullable(),
  })
  .openapi("OAuthAuthorizedToken");

export const oauthTokenListResponseSchema = z
  .object({
    tokens: z.array(oauthTokenItemSchema),
  })
  .openapi("OAuthTokenListResponse");

export const oauthTokenIdParamSchema = z.object({
  tokenId: z.coerce.number().int().positive(),
});

/** OIDC discovery / JWKS は環境依存フィールドが多いため緩めに。 */
export const openIdConfigurationSchema = z
  .record(z.string(), z.unknown())
  .openapi("OpenIdConfiguration");

export const jwksResponseSchema = z
  .object({
    keys: z.array(z.record(z.string(), z.unknown())),
  })
  .openapi("JwksResponse");

export const oidcUserinfoClaimsSchema = z
  .object({
    sub: z.string(),
    preferred_username: z.string().optional(),
    email: z.string().optional(),
    email_verified: z.boolean().optional(),
  })
  .passthrough()
  .openapi("OidcUserinfoClaims");

export const oauthProtocolErrorSchema = z
  .object({
    error: z.string(),
    error_description: z.string().optional(),
  })
  .openapi("OAuthProtocolError");

export const oauthIntrospectActiveSchema = z
  .object({
    active: z.literal(true),
    scope: z.string(),
    exp: z.number().int(),
    client_id: z.string().optional(),
    username: z.string().optional(),
  })
  .openapi("OAuthIntrospectActive");

export const oauthIntrospectInactiveSchema = z
  .object({
    active: z.literal(false),
  })
  .openapi("OAuthIntrospectInactive");

export const oauthDeviceAuthorizationResponseSchema = z
  .object({
    device_code: z.string(),
    user_code: z.string(),
    verification_uri: z.string(),
    verification_uri_complete: z.string(),
    expires_in: z.number().int(),
    interval: z.number().int(),
  })
  .openapi("OAuthDeviceAuthorizationResponse");

/** RFC 6749 token / revoke エラー（form-urlencoded リクエスト）。 */
export const oauthFormBodySchema = z
  .object({
    grant_type: z.string().optional(),
    client_id: z.string().optional(),
    client_secret: z.string().optional(),
    code: z.string().optional(),
    redirect_uri: z.string().optional(),
    refresh_token: z.string().optional(),
    device_code: z.string().optional(),
    code_verifier: z.string().optional(),
    token: z.string().optional(),
    token_type_hint: z.string().optional(),
    scope: z.string().optional(),
    resource: z.string().optional(),
  })
  .passthrough()
  .openapi("OAuthFormBody");

export const oauthErrorResponseSchema = z
  .object({
    error: z.string(),
    error_description: z.string().optional(),
  })
  .openapi("OAuthErrorResponse");

export const oauthTokenSuccessSchema = z
  .object({
    access_token: z.string(),
    token_type: z.string(),
    expires_in: z.number().int(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
    id_token: z.string().optional(),
  })
  .passthrough()
  .openapi("OAuthTokenSuccess");

/** RFC 7591/7592 DCR レスポンス（主要フィールドのみ）。 */
export const dcrClientResponseSchema = z
  .object({
    client_id: z.string(),
    redirect_uris: z.array(z.string()),
    grant_types: z.array(z.string()),
    token_endpoint_auth_method: z.string(),
    registration_access_token: z.string(),
    registration_client_uri: z.string(),
    client_name: z.string().optional(),
    client_secret: z.string().optional(),
  })
  .passthrough()
  .openapi("DcrClientResponse");

export const dcrClientMetadataSchema = z
  .object({
    redirect_uris: z.array(z.string()),
    client_name: z.string().optional(),
    token_endpoint_auth_method: z.string().optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    scope: z.string().optional(),
  })
  .passthrough()
  .openapi("DcrClientMetadata");

export const dcrErrorResponseSchema = z
  .object({
    error: z.string(),
    error_description: z.string(),
  })
  .openapi("DcrErrorResponse");

export const dcrClientIdParamSchema = z.object({
  clientId: z.string(),
});
