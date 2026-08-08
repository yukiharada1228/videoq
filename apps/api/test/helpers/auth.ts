/**
 * Test auth helpers for Better Auth migration.
 * Route tests inject `X-VideoQ-Test-User-Id` (non-production only).
 */

export const TEST_AUTH_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export function testAuthHeaders(userId = 5): Record<string, string> {
  return { "X-VideoQ-Test-User-Id": String(userId) };
}

/** @deprecated Prefer testAuthHeaders — kept for call-site compatibility. */
export async function signAccessToken(
  _secret: string,
  userId = 5,
  _issuer?: string,
  _sessionId?: string,
): Promise<string> {
  return `test-user-${userId}`;
}

export function bearerForTestUser(userId = 5): Record<string, string> {
  return {
    ...testAuthHeaders(userId),
    authorization: `Bearer test-user-${userId}`,
  };
}
