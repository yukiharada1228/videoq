import { useEffect, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useI18nLocation, useI18nNavigate } from '@/lib/i18n';
import { isPublicAuthPath } from '@/lib/authConfig';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const navigate = useI18nNavigate();
  const location = useI18nLocation();
  const pathnameRef = useRef(location.pathname);

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    apiClient.setUnauthorizedHandler(() => {
      queryClient.clear();
      if (!isPublicAuthPath(pathnameRef.current)) {
        navigate('/login');
      }
    });

    return () => {
      apiClient.setUnauthorizedHandler(undefined);
    };
  }, [navigate, queryClient]);

  return <>{children}</>;
}
