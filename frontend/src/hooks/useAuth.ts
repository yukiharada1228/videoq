import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18nNavigate, useI18nLocation, removeLocalePrefix } from '@/lib/i18n';
import type { User } from '@/lib/api';
import { authMeQueryOptions } from '@/lib/authQuery';
import { isPublicAuthPath } from '@/lib/authConfig';

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

interface UseAuthOptions {
  redirectToLogin?: boolean;
  onAuthError?: () => void;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { redirectToLogin = true, onAuthError } = options;
  const navigate = useI18nNavigate();
  const location = useI18nLocation();
  const pathname = location.pathname;
  const queryClient = useQueryClient();

  const onAuthErrorRef = useRef(onAuthError);
  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  const authRequired = !isPublicAuthPath(pathname);

  const authQuery = useQuery<User | null>({
    ...authMeQueryOptions,
    enabled: authRequired,
  });

  useEffect(() => {
    if (!authRequired || authQuery.isPending) return;

    const unauthorized = authQuery.isError || authQuery.data === null;
    if (!unauthorized) return;

    if (authQuery.error) {
      console.error('Authentication check failed:', authQuery.error);
    }
    if (redirectToLogin) {
      const currentPath = removeLocalePrefix(window.location.pathname);
      if (currentPath !== '/login') navigate('/login');
    }
    onAuthErrorRef.current?.();
  }, [
    authQuery.data,
    authQuery.error,
    authQuery.isError,
    authQuery.isPending,
    authRequired,
    redirectToLogin,
    navigate,
  ]);

  const checkAuth = useCallback(async () => {
    if (!authRequired) return;
    await queryClient.fetchQuery({
      ...authMeQueryOptions,
      staleTime: 0,
    });
  }, [authRequired, queryClient]);

  return {
    user: authRequired ? authQuery.data ?? null : null,
    isLoading: authRequired ? authQuery.isPending : false,
    refetch: checkAuth,
  };
}
