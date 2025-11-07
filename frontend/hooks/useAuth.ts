import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { apiClient, User } from '@/lib/api';

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
 * 認証状態を管理するカスタムフック（DRY原則に従う）
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { redirectToLogin = true, onAuthError } = options;
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // useRefでコールバックを保持し、無限ループを防ぐ
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const checkAuth = useCallback(async () => {
    try {
      const userData = await apiClient.getMe();
      setUser(userData);
    } catch (error) {
      // apiClient.getMe()内で401エラーが処理され、
      // トークンリフレッシュが試みられます。
      // リフレッシュにも失敗した場合は、apiClient内で/loginにリダイレクトされます。
      // ここでは、認証失敗時の追加処理や、
      // ネットワークエラーなど他の原因でgetMeが失敗した場合のハンドリングを行います。
      console.error('Authentication check failed:', error);
      if (redirectToLogin) {
        // apiClientがリダイレクトを処理しなかった場合に備える
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

