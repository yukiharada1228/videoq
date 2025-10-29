import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // useRefでコールバックを保持し、無限ループを防ぐ
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;

  const checkAuth = useCallback(async () => {
    // HttpOnly Cookieベースの認証では、非同期で認証状態をチェック
    const isAuth = await apiClient.isAuthenticated();
    if (!isAuth) {
      if (redirectToLogin) {
        router.push('/login');
      }
      setLoading(false);
      return;
    }

    try {
      const userData = await apiClient.getMe();
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      await apiClient.logout();
      if (redirectToLogin) {
        router.push('/login');
      }
      if (onAuthErrorRef.current) {
        onAuthErrorRef.current();
      }
    } finally {
      setLoading(false);
    }
  }, [redirectToLogin, router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { 
    user, 
    loading, 
    refetch: checkAuth,
  };
}

