import { DEVICE_GRANT_TYPE, escapeHtml } from "../../lib/oauth";
import type { OAuthApplication } from "./html-service";

/** Shared shell for OAuth HTML UIs (device / applications / tokens). */
export function deviceShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)} — VideoQ</title>
<style>
body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem;color:#111}
label{display:block;margin:.75rem 0 .25rem;font-weight:600}
input,select,textarea{width:100%;padding:.5rem;font:inherit}
button,.btn{display:inline-block;margin:.5rem .5rem 0 0;padding:.5rem 1rem;font:inherit;cursor:pointer}
.err{color:#b00020;margin:1rem 0}
ul{padding-left:1.2rem}
a{color:#0645ad}
</style></head><body>${body}</body></html>`;
}

export function logoutShell(body: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Logout — VideoQ</title>
<style>
body{font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem}
button{margin:.5rem .5rem 0 0;padding:.5rem 1rem;font:inherit;cursor:pointer}
.err{color:#b00020}
</style></head><body>${body}</body></html>`;
}

const GRANT_OPTIONS = [
  ["authorization-code", "Authorization code"],
  ["implicit", "Implicit"],
  ["password", "Resource owner password-based"],
  ["client-credentials", "Client credentials"],
  [DEVICE_GRANT_TYPE, "Device code"],
  ["openid-hybrid", "OpenID connect hybrid"],
] as const;

export function deviceUserCodeForm(actionToken: string, preset: string): string {
  return `<h1>Enter device code</h1>
       <form method="post" action="/api/oauth/device">
         <input type="hidden" name="action_token" value="${escapeHtml(actionToken)}"/>
         <label for="user_code">User code</label>
         <input id="user_code" name="user_code" value="${escapeHtml(preset)}" autocomplete="one-time-code" required/>
         <button type="submit">Continue</button>
       </form>`;
}

export function deviceConfirmForm(
  actionToken: string,
  appName: string,
  userCode: string,
  scopes: string[],
): string {
  return `<h1>Authorize ${escapeHtml(appName)}</h1>
       <p>User code: <strong>${escapeHtml(userCode)}</strong></p>
       <ul>${scopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
       <form method="post">
         <input type="hidden" name="action_token" value="${escapeHtml(actionToken)}"/>
         <button type="submit" name="allow" value="Authorize">Accept</button>
         <button type="submit" name="deny" value="Deny">Deny</button>
       </form>`;
}

export function appForm(
  actionToken: string,
  action: string,
  app?: OAuthApplication,
  secretOnce?: string | null,
): string {
  const name = app?.name ?? "";
  const redirect = app?.redirect_uris ?? "";
  const clientType = app?.client_type ?? "confidential";
  const grant = app?.authorization_grant_type ?? "authorization-code";
  const opts = GRANT_OPTIONS.map(
    ([v, label]) =>
      `<option value="${escapeHtml(v)}"${grant === v ? " selected" : ""}>${escapeHtml(label)}</option>`,
  ).join("");
  const secretNote = secretOnce
    ? `<p class="err">Client secret (copy now): <code>${escapeHtml(secretOnce)}</code></p>`
    : "";
  return `${secretNote}
    <form method="post" action="${escapeHtml(action)}">
      <input type="hidden" name="action_token" value="${escapeHtml(actionToken)}"/>
      <label>Name</label><input name="name" value="${escapeHtml(name)}" required/>
      <label>Client type</label>
      <select name="client_type">
        <option value="confidential"${clientType === "confidential" ? " selected" : ""}>Confidential</option>
        <option value="public"${clientType === "public" ? " selected" : ""}>Public</option>
      </select>
      <label>Authorization grant type</label>
      <select name="authorization_grant_type">${opts}</select>
      <label>Redirect uris (space-separated)</label>
      <textarea name="redirect_uris" rows="3">${escapeHtml(redirect)}</textarea>
      <button type="submit">Save</button>
    </form>`;
}
