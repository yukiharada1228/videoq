import { useEffect, useState, useCallback, useRef } from 'react';
import { useI18nNavigate, useI18nLocation, removeLocalePrefix } from '@/lib/i18n';
import { apiClient, type User } from '@/lib/api';

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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Hold callback with useRef to prevent infinite loops
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const checkAuth = useCallback(async () => {
    try {
      const userData = await apiClient.getMe();
      setUser(userData);
    } catch (error) {
      // 401 errors are handled in apiClient.getMe(), and token refresh is attempted.
      // If refresh also fails, apiClient redirects to /login.
      // Here we handle additional processing on auth failure,
      // or handle cases where getMe fails due to other causes like network errors.
      console.error('Authentication check failed:', error);
      if (redirectToLogin) {
        // Fallback in case apiClient didn't handle the redirect
        const currentPath = removeLocalePrefix(window.location.pathname);
        if (currentPath !== '/login') {
          navigate('/login');
        }
      }
      if (onAuthErrorRef.current) {
        onAuthErrorRef.current();
      }
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin, navigate]);

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
      checkAuth();
    } else {
      setLoading(false);
    }
  }, [checkAuth, pathname]);

  return {
    user,
    loading,
    refetch: checkAuth,
  };
}

