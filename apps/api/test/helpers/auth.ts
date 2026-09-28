/**
 * Test auth helpers for Better Auth (string UUID user ids).
 * Route tests inject `X-VideoQ-Test-User-Id` (non-production only).
 */

/** Deterministic test user ids (UUIDv4-shaped). */
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000005";

export function testAuthHeaders(userId: string = TEST_USER_ID): Record<string, string> {
  return { "X-VideoQ-Test-User-Id": userId };
}
