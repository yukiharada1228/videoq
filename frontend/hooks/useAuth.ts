import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from '@/i18n/routing';
import { apiClient, User } from '@/lib/api';
import { routing } from '@/i18n/routing';

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
  const router = useRouter();
  const pathname = usePathname();
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
        if (window.location.pathname !== '/login') {
          router.push('/login');
        }
      }
      if (onAuthErrorRef.current) {
        onAuthErrorRef.current();
      }
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin, router]);

  useEffect(() => {
    const stripLocale = (path: string) => {
      const locale = routing.locales.find(
        (loc) => path === `/${loc}` || path.startsWith(`/${loc}/`)
      );
      if (!locale) return path;
      const trimmed = path.slice(locale.length + 1);
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    };

    const publicPaths = [
      '/login',
      '/signup',
      '/signup/check-email',
      '/forgot-password',
      '/reset-password',
      '/verify-email',
      '/share',
    ];
    const normalizedPath = stripLocale(pathname);
    const authRequired = !publicPaths.some((path) =>
      normalizedPath.startsWith(path)
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

