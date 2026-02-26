import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface UseVerifyEmailQueryParams {
  uid: string | null;
  token: string | null;
}

export function useVerifyEmailQuery({ uid, token }: UseVerifyEmailQueryParams) {
  const isInvalidLink = !uid || !token;

  const verifyQuery = useQuery<{ detail?: string }>({
    queryKey: ['verifyEmail', uid ?? null, token ?? null],
    enabled: !isInvalidLink,
    retry: false,
    queryFn: async () => await apiClient.verifyEmail({ uid: uid!, token: token! }),
  });

  return {
    verifyQuery,
    isInvalidLink,
  };
}
