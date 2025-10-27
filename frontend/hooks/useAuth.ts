import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, User } from '@/lib/api';

interface UseAuthReturn {
  user: User | null;
  loading: boolean;
}

interface UseAuthOptions {
  redirectToLogin?: boolean;
  onAuthError?: () => void;
}

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { redirectToLogin = true, onAuthError } = options;
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    if (!apiClient.isAuthenticated()) {
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
      apiClient.logout();
      if (redirectToLogin) {
        router.push('/login');
      }
      if (onAuthError) {
        onAuthError();
      }
    } finally {
      setLoading(false);
    }
  };

  return { user, loading };
}

