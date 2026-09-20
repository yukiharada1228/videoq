import { authClient } from '@/lib/auth-client';

/**
 * Better Auth cookie session — source of truth for "signed in".
 * App profile fields come from the `account.me` tRPC query.
 */
export function useAuthSession() {
  const session = authClient.useSession();
  // Better Auth retains stale data on non-401 errors. Our server also uses 403
  // for suspended accounts; that response must hide the old signed-in state.
  if (session.error?.status === 401 || session.error?.status === 403) {
    return { ...session, data: null };
  }
  return session;
}

export async function fetchAuthSession() {
  return authClient.getSession();
}
