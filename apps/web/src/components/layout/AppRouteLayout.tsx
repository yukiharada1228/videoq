import type { ComponentProps, ReactNode } from 'react';
import { matchRoutes } from 'react-router-dom';
import { useI18nLocation } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { RouteContent } from '@/components/layout/RouteContent';

export type AppPageRoute = ({ index: true; path?: never } | { index?: false; path: string }) & {
  element: ReactNode;
  handle: Pick<ComponentProps<typeof AppPageShell>, 'activePage' | 'variant'>;
};

export function AppRouteLayout({ routes }: { routes: AppPageRoute[] }) {
  const { pathname } = useI18nLocation();
  // Match the same definitions as <Routes>, including ranking, decoding and case handling.
  const layout = matchRoutes(routes, { pathname })?.at(-1)?.route.handle;

  return (
    <AppPageShell {...layout}>
      <RouteContent />
    </AppPageShell>
  );
}

export function AuthRouteLayout() {
  return (
    <AuthLayout>
      <RouteContent />
    </AuthLayout>
  );
}
