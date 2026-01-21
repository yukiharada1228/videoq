import { useEffect, useCallback, useRef } from 'react';
import { useI18nNavigate, useI18nLocation, removeLocalePrefix } from '@/lib/i18n';
import { useAuthStore } from '@/stores';
import type { User } from '@/lib/api';

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
 * Wraps Zustand store for backward compatibility
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { redirectToLogin = true, onAuthError } = options;
  const navigate = useI18nNavigate();
  const location = useI18nLocation();
  const pathname = location.pathname;

  // Use Zustand store
  const { user, isLoading, error, checkAuth, setLoading } = useAuthStore();

  // Hold callback with useRef to prevent infinite loops
  const onAuthErrorRef = useRef(onAuthError);

  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  const handleCheckAuth = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);

  // Handle errors from store
  useEffect(() => {
    if (error && !isLoading) {
      console.error('Authentication check failed:', error);
      if (redirectToLogin) {
        const currentPath = removeLocalePrefix(window.location.pathname);
        if (currentPath !== '/login') {
          navigate('/login');
        }
      }
      if (onAuthErrorRef.current) {
        onAuthErrorRef.current();
      }
    }
  }, [error, isLoading, redirectToLogin, navigate]);

  useEffect(() => {
    const publicPaths = [
      '/login',
      '/signup',
      '/signup/check-email',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/share',
    ];
    const authRequired = !publicPaths.some((path) =>
      pathname.startsWith(path)
    );

    if (authRequired) {
      handleCheckAuth();
    } else {
      setLoading(false);
    }
  }, [handleCheckAuth, pathname, setLoading]);

  return {
    user,
    loading: isLoading,
    refetch: handleCheckAuth,
  };
}

