/**
 * Test auth helpers for Better Auth (string UUID user ids).
 * Route tests inject `X-VideoQ-Test-User-Id` (non-production only).
 */

/** Deterministic test user ids (UUIDv4-shaped). */
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000005";
export const TEST_ADMIN_USER_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_OAUTH_USER_ID = "00000000-0000-4000-8000-000000000009";

export const TEST_AUTH_SESSION_ID = "00000000-0000-4000-8000-000000000001";

export function testAuthHeaders(userId: string = TEST_USER_ID): Record<string, string> {
  return { "X-VideoQ-Test-User-Id": userId };
}

/** @deprecated Prefer testAuthHeaders — kept for call-site compatibility. */
export async function signAccessToken(
  _secret: string,
  userId: string = TEST_USER_ID,
  _issuer?: string,
  _sessionId?: string,
): Promise<string> {
  return `test-user-${userId}`;
}

export function bearerForTestUser(userId: string = TEST_USER_ID): Record<string, string> {
  return {
    ...testAuthHeaders(userId),
    authorization: `Bearer test-user-${userId}`,
  };
}
