import { apiClient, type User } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

/**
 * App profile from `/account/me`.
 * Gate with Better Auth `useAuthSession()` — enable only when a session exists.
 */
export const authMeQueryOptions = {
  queryKey: queryKeys.auth.me,
  queryFn: async (): Promise<User | null> => await apiClient.getMeOrNull(),
  retry: false as const,
  staleTime: 60_000,
};

