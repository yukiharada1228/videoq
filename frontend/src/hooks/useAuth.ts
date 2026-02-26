import { useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useI18nNavigate, useI18nLocation, removeLocalePrefix } from '@/lib/i18n';
import { apiClient, type User } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

interface UseAuthOptions {
  redirectToLogin?: boolean;
  onAuthError?: () => void;
}

/**
 * Custom hook to manage authentication state
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { redirectToLogin = true, onAuthError } = options;
  const navigate = useI18nNavigate();
  const location = useI18nLocation();
  const pathname = location.pathname;
  const queryClient = useQueryClient();

  // Hold callback with useRef to prevent infinite loops
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const publicPaths = [
    '/login',
    '/signup',
    '/signup/check-email',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/share',
  ];
  const authRequired = !publicPaths.some((path) => pathname.startsWith(path));

  const authQuery = useQuery<User | null>({
    queryKey: queryKeys.auth.me,
    enabled: authRequired,
    queryFn: async () => (await apiClient.getMe()) ?? null,
    retry: false,
  });

  useEffect(() => {
    if (!authRequired || !authQuery.error) {
      return;
    }

    // 401 errors are handled in apiClient.getMe(), and token refresh is attempted.
    // If refresh also fails, apiClient redirects to /login.
    console.error('Authentication check failed:', authQuery.error);
    if (redirectToLogin) {
      const currentPath = removeLocalePrefix(window.location.pathname);
      if (currentPath !== '/login') {
        navigate('/login');
      }
    }
    if (onAuthErrorRef.current) {
      onAuthErrorRef.current();
    }
  }, [authQuery.error, authRequired, redirectToLogin, navigate]);

  const checkAuth = useCallback(async () => {
    if (!authRequired) {
      return;
    }
    await queryClient.fetchQuery({
      queryKey: queryKeys.auth.me,
      queryFn: async () => (await apiClient.getMe()) ?? null,
      retry: false,
    });
  }, [authRequired, queryClient]);

  return {
    user: authRequired ? authQuery.data ?? null : null,
    loading: authRequired ? (authQuery.isLoading || authQuery.isFetching) : false,
    refetch: checkAuth,
  };
}
