/**
 * OAuth 2.1 Authorization Server helpers（django-oauth-toolkit 互換）。
 * テーブル・トークン形式・メタデータは DOT / VideoQ settings.OAUTH2_PROVIDER に合わせる。
 */
import { sha256Hex } from "../utils/crypto";
import type { Bindings } from "../types/bindings";

export const OAUTH_SCOPES: Record<string, string> = {
  read: "Read-only access to VideoQ via the MCP endpoint",
  // DOT IntrospectTokenView.required_scopes。発行は通常しないが Bearer 経路用に定義。
  introspection: "Introspect OAuth tokens",
  // OIDC（OIDC_ENABLED=true 時に authorize/token/userinfo で使用）
  openid: "OpenID Connect",
  profile: "Profile claims (preferred_username)",
  email: "Email claims",
};
export const DEFAULT_SCOPES = ["read"] as const;
export const DCR_REGISTRATION_SCOPE = "oauth2_provider:registration";

export const ACCESS_TOKEN_EXPIRE_SECONDS = 60 * 60;
export const REFRESH_TOKEN_EXPIRE_SECONDS = 60 * 60 * 24 * 30;
export const AUTHORIZATION_CODE_EXPIRE_SECONDS = 60;
export const DEVICE_CODE_EXPIRE_SECONDS = 1800;
export const DEVICE_FLOW_INTERVAL = 5;
export const DEVICE_GRANT_TYPE =
  "urn:ietf:params:oauth:grant-type:device_code";
/** DCR registration access token: DOT 既定は far-future（year 9999）。 */
export const DCR_REGISTRATION_TOKEN_EXPIRES = new Date("9999-12-31T23:59:59.000Z");

export const ALLOWED_REDIRECT_SCHEMES = new Set(["https", "http"]);
export const SUPPORTED_TOKEN_AUTH_METHODS = [
  "none",
  "client_secret_basic",
  "client_secret_post",
] as const;

const TOKEN_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** oauthlib.common.generate_token / ClientIdGenerator 相当（バイアス回避）。 */
export function generateOpaqueToken(length: number): string {
  const n = TOKEN_CHARS.length;
  const limit = Math.floor(256 / n) * n;
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && out.length < length; i += 1) {
      if (bytes[i] < limit) out += TOKEN_CHARS[bytes[i] % n];
    }
  }
  return out;
}

export function generateClientId(): string {
  return generateOpaqueToken(40);
}

export function generateClientSecret(): string {
  return generateOpaqueToken(128);
}

export function generateAccessTokenValue(): string {
  return generateOpaqueToken(30);
}

export function generateAuthorizationCode(): string {
  return generateOpaqueToken(30);
}

export async function tokenChecksum(raw: string): Promise<string> {
  return sha256Hex(raw);
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) without padding. */
export async function pkceS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyPkce(
  verifier: string,
  challenge: string,
  method: string,
): Promise<boolean> {
  if (!verifier || !challenge) return false;
  if (method === "S256") {
    const expected = await pkceS256Challenge(verifier);
    return expected === challenge;
  }
  if (method === "plain") return verifier === challenge;
  return false;
}

export function issuerFromEnv(env: Bindings, reqUrl: string): string {
  return (env.OAUTH2_PROVIDER_ISSUER_URL || new URL(reqUrl).origin).replace(
    /\/$/,
    "",
  );
}

export function protectedResourceIdentifier(issuer: string): string {
  return `${issuer}/api/mcp/`;
}

/** RFC 8628: Base32hex (0-9A-V) user_code。DOT 既定長 8。 */
export function generateDeviceUserCode(length = 8): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

export function buildAuthorizationServerMetadata(issuer: string): Record<string, unknown> {
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth/authorize/`,
    token_endpoint: `${issuer}/api/oauth/token/`,
    registration_endpoint: `${issuer}/api/oauth/register/`,
    revocation_endpoint: `${issuer}/api/oauth/revoke_token/`,
    introspection_endpoint: `${issuer}/api/oauth/introspect/`,
    device_authorization_endpoint: `${issuer}/api/oauth/device-authorization/`,
    response_types_supported: ["code"],
    // Django VideoQ settings は device を出さないが、移植後はエンドポイント公開に合わせて掲載。
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      DEVICE_GRANT_TYPE,
    ],
    scopes_supported: Object.keys(OAUTH_SCOPES).sort(),
    code_challenge_methods_supported: ["plain", "S256"],
    token_endpoint_auth_methods_supported: [...SUPPORTED_TOKEN_AUTH_METHODS],
    revocation_endpoint_auth_methods_supported: [...SUPPORTED_TOKEN_AUTH_METHODS],
    client_id_metadata_document_supported: false,
  };
}

export function buildProtectedResourceMetadata(issuer: string): Record<string, unknown> {
  return {
    resource: protectedResourceIdentifier(issuer),
    authorization_servers: [issuer],
    scopes_supported: Object.keys(OAUTH_SCOPES).sort(),
    bearer_methods_supported: ["header"],
    resource_documentation:
      "https://github.com/yukiharada1228/videoq#mcp-remote-endpoint",
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isValidRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    return ALLOWED_REDIRECT_SCHEMES.has(u.protocol.replace(":", ""));
  } catch {
    return false;
  }
}

/** RFC 8707: absolute URI with scheme + host, no fragment. */
export function isValidResourceUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (!u.protocol || !u.hostname) return false;
    if (u.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export function redirectUriHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).hostname || redirectUri;
  } catch {
    return redirectUri;
  }
}

export type ConsentPageParams = {
  applicationName: string;
  redirectUriHost: string | null;
  scopesDescriptions: string[];
  isDcrClient: boolean;
  csrfToken: string;
  hidden: Record<string, string>;
  error?: { error: string; description: string };
};

/** Django `oauth2_provider/authorize.html` に近い同意画面 HTML。 */
export function renderAuthorizeHtml(p: ConsentPageParams): string {
  const year = new Date().getUTCFullYear();
  const app = escapeHtml(p.applicationName);
  if (p.error) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorization error — VideoQ</title>
  ${AUTHORIZE_STYLES}
</head>
<body>
  <main>
    <section class="brand-pane">${BRAND_PANE_INNER}</section>
    <section class="form-pane">
      <div class="form-stack">
        <div class="mobile-brand">${MOBILE_BRAND}</div>
        <div class="intro">
          <span class="badge">Connect a client</span>
          <h1>Authorization error</h1>
          <div class="accent"></div>
        </div>
        <div class="error-card">
          <strong>${escapeHtml(p.error.error)}</strong>
          <p>${escapeHtml(p.error.description)}</p>
        </div>
        <div class="footer">© ${year} VideoQ — Every learning moment</div>
      </div>
    </section>
  </main>
</body>
</html>`;
  }

  const scopes = p.scopesDescriptions
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  const redirectRow = p.redirectUriHost
    ? `<dt>Redirects to</dt><dd>${escapeHtml(p.redirectUriHost)}</dd>`
    : "";
  const warning = p.isDcrClient
    ? `<div class="warning" role="note">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>This client registered itself via Dynamic Client Registration and has not been reviewed by VideoQ. Make sure the client name and redirect destination match the app you expect before authorizing.</span>
      </div>`
    : "";

  const hidden = Object.entries(p.hidden)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${app} — VideoQ</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap" />
  ${AUTHORIZE_STYLES}
</head>
<body>
  <main>
    <section class="brand-pane">${BRAND_PANE_INNER}</section>
    <section class="form-pane">
      <div class="form-stack">
        <div class="mobile-brand">${MOBILE_BRAND}</div>
        <div class="intro">
          <span class="badge">Connect a client</span>
          <h1>Authorize ${app}?</h1>
          <div class="accent"></div>
          <p class="lead">This app is requesting access to your VideoQ account with the following scopes.</p>
        </div>
        <dl class="meta">
          <dt>Client</dt>
          <dd>${app}</dd>
          ${redirectRow}
        </dl>
        <ul class="scopes">${scopes}</ul>
        ${warning}
        <form id="authorizationForm" method="post">
          <input type="hidden" name="csrfmiddlewaretoken" value="${escapeHtml(p.csrfToken)}" />
          ${hidden}
          <div class="actions">
            <button class="cancel" type="submit" name="allow" value="">Cancel</button>
            <button class="allow" type="submit" name="allow" value="True">Authorize</button>
          </div>
        </form>
        <div class="footer">© ${year} VideoQ — Every learning moment</div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

const BRAND_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/><circle cx="12" cy="12" r="10"/></svg>`;

const BRAND_PANE_INNER = `
  <div class="brand-stack">
    <div class="brand-icon">${BRAND_ICON}</div>
    <div class="brand-text">
      <h2 class="brand-name">VideoQ</h2>
      <p class="brand-tagline">Transform every video into the ultimate learning experience</p>
    </div>
  </div>`;

const MOBILE_BRAND = `
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z"/><circle cx="12" cy="12" r="10"/></svg>
  <span class="mobile-brand-name">VideoQ</span>`;

const AUTHORIZE_STYLES = `<style>
:root{color-scheme:light;--green-dark:#00652c;--green-mid:#15803d;--green-pale:#d3ffd5;--ink:#191c19;--ink-soft:#3f493f;--ink-mute:#6f7a6e;--border:#e6e8e4;--bg:#ffffff}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";color:var(--ink);background:var(--bg)}
main{display:flex;flex-direction:column;min-height:100vh}
.brand-pane{display:none;position:relative;background:var(--green-mid);color:#fff;padding:48px;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.brand-pane::before,.brand-pane::after{content:"";position:absolute;width:384px;height:384px;background:rgba(255,255,255,.05);border-radius:50%;filter:blur(64px)}
.brand-pane::before{bottom:-96px;left:-96px}.brand-pane::after{top:-96px;right:-96px}
.brand-stack{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:24px}
.brand-icon{background:rgba(255,255,255,.1);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);padding:16px;border-radius:16px}
.brand-text{text-align:center}.brand-name{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:36px;line-height:40px;letter-spacing:-.025em;margin:0 0 8px}
.brand-tagline{color:rgba(255,255,255,.7);font-size:14px;line-height:20px;font-weight:500;letter-spacing:.025em;margin:0}
.form-pane{flex:1;background:#fff;display:flex;align-items:center;justify-content:center;padding:32px}
.form-stack{width:100%;max-width:440px;display:flex;flex-direction:column}
.mobile-brand{display:flex;align-items:center;gap:8px;justify-content:center;margin-bottom:32px;color:var(--green-dark)}
.mobile-brand-name{font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:24px;line-height:32px;letter-spacing:-.025em}
.intro{margin-bottom:32px}.badge{display:inline-flex;padding:6px 16px;border-radius:999px;background:var(--green-pale);color:#2c4e32;font-size:12px;line-height:16px;font-weight:700;letter-spacing:.025em;margin-bottom:24px}
h1{font-weight:800;font-size:30px;line-height:1.25;letter-spacing:-.025em;color:var(--ink);margin:0}
.accent{height:6px;width:56px;background:var(--green-dark);border-radius:999px;margin:16px 0 24px}
.lead{color:var(--ink-mute);font-size:14px;line-height:1.625;margin:0}
.meta{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;padding:16px 20px;border:1px solid var(--border);border-radius:12px;margin:0 0 24px}
.meta dt{font-weight:700;color:#6b7280;font-size:12px;line-height:16px;align-self:center}
.meta dd{margin:0;color:var(--ink);font-size:14px;line-height:20px;word-break:break-all}
.scopes{list-style:none;margin:0 0 24px;padding:16px 20px;background:#f2f4ef;border-radius:12px;display:flex;flex-direction:column;gap:6px}
.scopes li{color:var(--ink);font-size:14px;display:flex;align-items:flex-start;gap:10px}
.scopes li::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--green-dark);margin-top:8px;flex-shrink:0}
.warning{display:flex;gap:12px;padding:14px 16px;background:#fff9e6;border:1px solid #f5d780;border-radius:12px;color:#6b4f00;font-size:13px;line-height:1.5;margin-bottom:24px}
.warning svg{flex-shrink:0;margin-top:2px}
.actions{display:flex;gap:12px;margin-top:8px}
button{flex:1;border:0;border-radius:12px;padding:16px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;transition:all 200ms cubic-bezier(.4,0,.2,1)}
.cancel{background:#f2f4ef;color:var(--ink-soft)}.cancel:hover{background:#e6e8e0}
.allow{background:var(--green-dark);color:#fff;box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1)}
.allow:hover{background:#005323;transform:translateY(-2px);box-shadow:0 20px 25px -5px rgba(0,0,0,.1),0 8px 10px -6px rgba(0,0,0,.1)}
.allow:active{transform:scale(.98)}
.error-card{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:12px;border-radius:12px;font-size:14px}
.error-card strong{display:block;margin-bottom:4px}.error-card p{margin:0;line-height:1.5}
.footer{margin-top:64px;text-align:center;color:#9ca3af;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase}
@media(min-width:640px){.form-pane{padding:48px}}
@media(min-width:768px){main{flex-direction:row}.brand-pane{display:flex;width:50%}.form-pane{width:50%}.mobile-brand{display:none}}
</style>`;
