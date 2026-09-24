import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useI18nNavigate, useI18nLocation, removeLocalePrefix } from '@/lib/i18n';
import type { User } from '@/lib/api';
import { useAuthSession } from '@/lib/authSession';
import { isPublicAuthPath } from '@/lib/authConfig';
import { trpc } from '@/lib/trpc';

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
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
  const session = useAuthSession();

  const onAuthErrorRef = useRef(onAuthError);
  useEffect(() => {
    onAuthErrorRef.current = onAuthError;
  }, [onAuthError]);

  const authRequired = !isPublicAuthPath(pathname);
  const hasSession = Boolean(session.data?.user);

  const authQuery = useQuery(trpc.account.me.queryOptions(undefined, {
    enabled: authRequired && !session.isPending && hasSession,
    retry: false,
    staleTime: 60_000,
  }));

  useEffect(() => {
    if (!authRequired || session.isPending) return;
    // Match AuthProvider: a failed session lookup does not prove sign-out.
    if (session.error && session.error.status !== 401 && session.error.status !== 403) return;

    // A transient API/server failure is not proof that the session is invalid.
    // Keep the user on the current page so a later query refresh can recover.
    if (authQuery.error) {
      console.error('Authentication check failed:', authQuery.error);
      return;
    }

    const unauthorized =
      !hasSession ||
      (!authQuery.isPending && authQuery.data === null);
    if (!unauthorized) return;

    if (redirectToLogin) {
      const currentPath = removeLocalePrefix(window.location.pathname);
      if (currentPath !== '/login') navigate('/login');
    }
    onAuthErrorRef.current?.();
  }, [
    authQuery.data,
    authQuery.error,
    authQuery.isPending,
    authRequired,
    hasSession,
    redirectToLogin,
    session.error,
    session.isPending,
    navigate,
  ]);

  return {
    user: authRequired && hasSession ? authQuery.data ?? null : null,
    isLoading: authRequired
      ? session.isPending || (hasSession && authQuery.isPending)
      : false,
  };
}
