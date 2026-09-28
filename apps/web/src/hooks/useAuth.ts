import { useQuery } from '@tanstack/react-query';
import { useI18nLocation } from '@/lib/i18n';
import type { User } from '@/lib/api';
import { useAuthSession } from '@/lib/authSession';
import { isPublicAuthPath } from '@/lib/authConfig';
import { trpc } from '@/lib/trpc';

interface UseAuthReturn {
  user: User | null;
  isLoading: boolean;
}

/** Reads the app profile; AuthProvider owns session revalidation and navigation. */
export function useAuth(): UseAuthReturn {
  const { pathname } = useI18nLocation();
  const session = useAuthSession();

  const authRequired = !isPublicAuthPath(pathname);
  const hasSession = Boolean(session.data?.user);

  const authQuery = useQuery(trpc.account.me.queryOptions(undefined, {
    enabled: authRequired && !session.isPending && hasSession,
    retry: false,
    staleTime: 60_000,
  }));

  return {
    user: authRequired && hasSession ? authQuery.data ?? null : null,
    isLoading: authRequired
      ? session.isPending || (hasSession && authQuery.isPending)
      : false,
  };
}
