export const OAUTH_AUTHORIZE_PATH = '/api/auth/oauth2/authorize';

/**
 * Better Auth oauth-provider sends unauthenticated users to
 * `/login?client_id=...&redirect_uri=...` (signed authorize query).
 * After login, resume that exact authorize request.
 */
export function oauthAuthorizeResumeUrl(
  search: string | URLSearchParams,
): string | null {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : new URLSearchParams(search);
  const clientId = params.get('client_id')?.trim();
  const redirectUri = params.get('redirect_uri')?.trim();
  const responseType = params.get('response_type');
  if (!clientId || !redirectUri) return null;
  if (responseType && responseType !== 'code') return null;
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  } catch {
    return null;
  }
  const qs = params.toString();
  return qs ? `${OAUTH_AUTHORIZE_PATH}?${qs}` : null;
}
