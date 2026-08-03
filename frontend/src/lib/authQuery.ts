import { apiClient, type User } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export const authMeQueryOptions = {
  queryKey: queryKeys.auth.me,
  queryFn: async (): Promise<User | null> => await apiClient.getMeOrNull(),
  retry: false as const,
  staleTime: 60_000,
};
