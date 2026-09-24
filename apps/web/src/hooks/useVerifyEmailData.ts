import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

interface UseVerifyEmailQueryParams {
  token: string | null;
}

export function useVerifyEmailQuery({ token }: UseVerifyEmailQueryParams) {
  const isInvalidLink = !token;

  const verifyQuery = useQuery<{ detail?: string }>({
    queryKey: ['verifyEmail', token ?? null],
    enabled: !isInvalidLink,
    retry: false,
    // A completed verification must not be repeated on reconnect or remount.
    staleTime: Infinity,
    queryFn: () => apiClient.verifyEmail({ token: token! }),
  });

  return {
    verifyQuery,
    isInvalidLink,
  };
}
