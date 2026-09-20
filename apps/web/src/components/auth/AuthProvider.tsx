import { useEffect, useRef, useState, type ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useI18nLocation, useI18nNavigate } from '@/lib/i18n';
import { isPublicAuthPath } from '@/lib/authConfig';
import { TRPC_UNAUTHORIZED_EVENT } from '@/lib/trpc';
import { useAuthSession } from '@/lib/authSession';
import { appQueryClient, replaceAppQueryClient } from '@/lib/queryClient';

interface AuthProviderProps {
  children: ReactNode;
  initialQueryClient?: QueryClient;
}

export function AuthProvider({ children, initialQueryClient = appQueryClient }: AuthProviderProps) {
  const navigate = useI18nNavigate();
  const location = useI18nLocation();
  const pathnameRef = useRef(location.pathname);
  const session = useAuthSession();
  const userId = session.data?.user.id ?? null;
  const [cache, setCache] = useState({ userId, queryClient: initialQueryClient });
  const { queryClient } = cache;
  const identityChanged = userId !== cache.userId;

  useEffect(() => {
    if (!identityChanged) return;

    // Better Auth also refreshes sessions after changes in another tab. Keep
    // consumers unmounted until the cache is replaced. Late mutation callbacks
    // can still write to their captured client, so clearing it alone is unsafe.
    queryClient.clear();
    let active = true;
    queueMicrotask(() => {
      if (active) setCache({ userId, queryClient: replaceAppQueryClient() });
    });
    return () => { active = false; };
  }, [identityChanged, queryClient, userId]);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const resetAndRedirect = () => {
      queryClient.clear();
      if (!isPublicAuthPath(pathnameRef.current)) {
        navigate('/login');
      }
    };
    const handleTrpcUnauthorized = () => {
      void apiClient.logout().catch(() => undefined).then(resetAndRedirect);
    };

    apiClient.setUnauthorizedHandler(resetAndRedirect);
    window.addEventListener(TRPC_UNAUTHORIZED_EVENT, handleTrpcUnauthorized);

    return () => {
      apiClient.setUnauthorizedHandler(undefined);
      window.removeEventListener(TRPC_UNAUTHORIZED_EVENT, handleTrpcUnauthorized);
    };
  }, [navigate, queryClient]);

  return identityChanged ? null : (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
